set dotenv-load := true
set export := true

# Compose stack: `dev` (default) or `prod`. Selected once here so recipes never pass -f flags. Which Optional pieces
# run is the one list `COMPOSE_PROFILES` in .env (ADR-0029), which Compose itself reads.
stack := env("STACK", if env("NUXT_APP_ENV", "") == "production" { "prod" } else { "dev" })
export COMPOSE_FILE := env("DEPLOY_COMPOSE_FILE", "compose.yaml:compose." + stack + ".yaml")

# Show every command and its help text.
default:
    @just --list

# Install dependencies and create/update pnpm-lock.yaml. Commit the lockfile afterward.
install:
    corepack pnpm install

# CI / Docker: reproducible install only; fails if the lockfile is stale or absent.
ci-install:
    corepack pnpm install --frozen-lockfile

# Start local stateful dependencies (PostgreSQL). App containers are started separately.
services-up:
    docker compose up -d --wait postgres

# Stop the app and the database. Volumes are kept.
services-down:
    docker compose stop

# Production-like local run: prepared database, then every service of the active profiles from the active stack.
up: db-prepare
    docker compose up -d
    @echo "App: http://127.0.0.1:${APP_HOST_PORT:-3000}  (COMPOSE_PROFILES=${COMPOSE_PROFILES:-})"

# Whole development stack in Docker: idempotent database preparation, then the Nuxt dev server (HMR) and the services of the active profiles.
dev: db-prepare
    docker compose up -d
    @echo "Development app: http://127.0.0.1:${APP_HOST_PORT:-3000}  (COMPOSE_PROFILES=${COMPOSE_PROFILES:-}; just logs app | just shell app | just dev-down)"

# Stop and remove containers of every profile; volumes (database, node_modules) are kept.
dev-down:
    docker compose --profile "*" down

# Follow container logs, optionally for one service.
logs *service:
    docker compose logs -f --tail=200 {{service}}

# Open a shell in a running service container.
shell service="app":
    docker compose exec {{service}} sh

# DESTRUCTIVE, local only: remove containers AND all volumes (database, node_modules).
dev-reset:
    @if [ "${NUXT_APP_ENV:-}" != "local" ] || [ "{{stack}}" != "dev" ]; then echo "Refusing dev-reset unless NUXT_APP_ENV=local is set explicitly and the dev stack is selected"; exit 1; fi
    @confirm="${DEV_RESET_CONFIRM:-}"; if [ -z "$confirm" ]; then printf "This deletes ALL local volumes. Type 'nuxt-admin-starter' to continue: "; read -r confirm; fi; if [ "$confirm" != "nuxt-admin-starter" ]; then echo "Aborted; nothing was removed."; exit 1; fi
    docker compose --profile "*" down --volumes --remove-orphans

# GlitchTip (the `monitoring` profile). `just dev`/`just up` start it when COMPOSE_PROFILES lists `monitoring`; these two are
# for provisioning or starting it on its own. The database step is idempotent and the glitchtip service waits for it.
monitoring-db-ensure:
    docker compose run --rm monitoring-db-init

monitoring-up:
    docker compose --profile monitoring up -d glitchtip

# Quality gates.
lint:
    corepack pnpm lint

typecheck:
    corepack pnpm typecheck

# Unit and component tests.
test:
    corepack pnpm test

build:
    corepack pnpm build

# Dependency vulnerability audit: fails on any high/critical advisory.
audit:
    corepack pnpm audit --audit-level high

# Scan the working tree and git history for committed secrets (runs gitleaks in Docker).
secret-scan:
    docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.28.0 git /repo --config /repo/.gitleaks.toml --redact --no-banner

# Database. These run in the Docker stack (dev image locally, tools image in production) against the `postgres` service.
# Check/create the target database only if missing; never drops or resets it.
db-ensure:
    docker compose run --rm db-ensure

# Generate a reviewable migration from the current Drizzle schema. Review the output; this does not apply it.
db-generate name="schema-change":
    docker compose run --rm --no-deps app corepack pnpm exec drizzle-kit generate --name {{name}}

# Check migration-chain consistency without changing the schema. Runs on the host and needs no database.
db-check:
    DATABASE_URL="${DATABASE_URL:-postgres://check:check@localhost:5432/check}" corepack pnpm db:check

# Apply committed pending migrations only. Safe to repeat; not an auto-generation command.
db-migrate:
    docker compose run --rm migrate

# Reconcile the Permission catalogue and apply seed versions that have not run. Safe to repeat.
db-seed:
    docker compose run --rm seed

# Idempotent bootstrap: start PostgreSQL, ensure the database exists, apply migrations, seed.
db-prepare:
    just services-up
    just db-ensure
    just db-migrate
    just db-seed
    @echo "Database preparation complete."

# Explicitly local-only prototyping. Never run this for staging or production.
db-push-local:
    @if [ "${NUXT_APP_ENV:-}" != "local" ]; then echo "Refusing db:push unless NUXT_APP_ENV=local is explicitly set in .env or the environment"; exit 1; fi
    docker compose run --rm --no-deps app corepack pnpm exec drizzle-kit push

# Postgres-backed tests only. Needs TEST_DATABASE_ADMIN_URL (a role that may create and drop databases).
test-integration:
    corepack pnpm test:integration

# Validate the resolved dev and prod Compose configurations (and COMPOSE_PROFILES) without starting services. Needs Docker.
compose-check:
    node scripts/ops/compose-check.mjs

# Docker-based infra tests (compose-check rules). They skip unless INFRA_TESTS=1, so no other recipe or CI job runs them.
test-compose:
    INFRA_TESTS=1 corepack pnpm exec vitest run tests/infra

# Edge proxy (Optional piece `edge`). Both do nothing when `edge` is absent from COMPOSE_PROFILES.
# Production guards for the proxy: real domain and ACME email, public URL in step. Run before switching a release.
edge-guards:
    bash scripts/ops/edge-guards.sh

# Certificate expiry of the hostnames Caddy serves (warns, never fails).
cert-status:
    bash scripts/ops/cert-status.sh

# Browsers for the E2E suite. Chromium runs everywhere; Firefox and WebKit are installed by `test-e2e-cross-browser`.
playwright-install *flags:
    corepack pnpm exec playwright install {{flags}} chromium

# Playwright against a dev server it starts itself (port E2E_PORT, default 3100) and the database in DATABASE_URL.
test-e2e:
    corepack pnpm test:e2e

# The Playwright suite as N isolated shards in parallel. Each shard has its own database (a clone of a migrated template
# with the production seed only) and its own server. Extra arguments go to Playwright, e.g.
# `just test-e2e-sharded 1 -- tests/e2e/sign-in.spec.ts`. Needs DATABASE_URL and DATABASE_ADMIN_URL (a role that may
# create databases). Set E2E_POLLING=1 on a machine near its inotify limit, and E2E_SERVER=dev for dev servers.
test-e2e-sharded shards="3" *args:
    corepack pnpm test:e2e:sharded --shards {{shards}} {{ if args == "" { "" } else { "-- " + args } }}

# The `@cross-browser` subset (the specs tagged for it) in Firefox and WebKit, on one isolated shard. CI runs this;
# locally it downloads two more browsers.
test-e2e-cross-browser:
    corepack pnpm exec playwright install --with-deps firefox webkit
    CROSS_BROWSER=1 corepack pnpm test:e2e:sharded --shards 1 -- --project=firefox --project=webkit
