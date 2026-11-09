set dotenv-load := true
set export := true

# Show every command and its help text.
default:
    @just --list

# Install dependencies and create/update pnpm-lock.yaml. Commit the lockfile afterward.
install:
    corepack pnpm install

# CI / Docker: reproducible install only; fails if the lockfile is stale or absent.
ci-install:
    corepack pnpm install --frozen-lockfile

# Start the Nuxt dev server with HMR on http://localhost:3000.
dev:
    corepack pnpm dev

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

# Database. These run on the host against DATABASE_URL (from .env); the Docker dev stack wraps them.
# Check/create the target database only if missing; never drops or resets it. Needs DATABASE_ADMIN_URL.
db-ensure:
    corepack pnpm db:ensure

# Generate a reviewable migration from the current Drizzle schema. Review the output; this does not apply it.
db-generate name="schema-change":
    corepack pnpm db:generate --name {{name}}

# Check migration-chain consistency without changing the schema.
db-check:
    DATABASE_URL="${DATABASE_URL:-postgres://check:check@localhost:5432/check}" corepack pnpm db:check

# Apply committed pending migrations only. Safe to repeat; not an auto-generation command.
db-migrate:
    corepack pnpm db:migrate

# Reconcile the Permission catalogue and apply seed versions that have not run. Safe to repeat.
db-seed:
    corepack pnpm db:seed

# Idempotent bootstrap: ensure the database exists, apply migrations, seed.
db-prepare:
    just db-ensure
    just db-migrate
    just db-seed
    @echo "Database preparation complete."

# Explicitly local-only prototyping. Never run this for staging or production.
db-push-local:
    @if [ "${APP_ENV:-}" != "local" ]; then echo "Refusing db:push unless APP_ENV=local is explicitly set in .env or the environment"; exit 1; fi
    corepack pnpm exec drizzle-kit push

# Postgres-backed tests only. Needs TEST_DATABASE_ADMIN_URL (a role that may create and drop databases).
test-integration:
    corepack pnpm test:integration
