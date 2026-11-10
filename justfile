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

# Database backups (the `backup` profile; docs/optional-pieces/backups.md). The nightly job is the `backup` service that
# `just dev`/`just up` start when COMPOSE_PROFILES lists `backup`; these recipes run the same job once, in a throwaway
# container. They need BACKUP_S3_* in .env. With `backup` Off they do nothing.
# Dump the database to the bucket right now (same retention as the nightly run).
backup-now:
    bash scripts/ops/backup-run.sh now

# Last-success check: the newest dump in the bucket and its age. Exit 0 healthy, 1 no recent dump, 2 no destination
# configured, 3 bucket unreachable. `deploy` and `release-status` run it and never fail because of it.
backup-status *release:
    bash scripts/ops/backup-run.sh status

# List the dumps in the bucket, oldest first (the keys that backup-restore takes).
backup-list:
    bash scripts/ops/backup-run.sh list

# Restore a dump into a NEW scratch database (default restore_<timestamp>, or the name you give); the live database is never touched.
backup-restore key *scratch:
    bash scripts/ops/backup-run.sh restore {{key}} {{scratch}}

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

# Smoke check of a running app: liveness, readiness, the landing page and the sign-in page. Needs only curl.
smoke base_url="http://127.0.0.1:3000":
    bash scripts/ops/smoke-check.sh {{base_url}}

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

# demo-ticket:start
# Dev only (NUXT_APP_ENV=local, dev stack): about 40 demo tickets and 3 dev Users holding `super`, only into an empty table. Run after `just db-prepare`.
db-seed-dev:
    @if [ "${NUXT_APP_ENV:-}" != "local" ] || [ "{{stack}}" != "dev" ]; then echo "Refusing db-seed-dev unless NUXT_APP_ENV=local is set explicitly and the dev stack is selected"; exit 1; fi
    docker compose run --rm -e NUXT_APP_ENV=local seed corepack pnpm exec tsx scripts/db/demo-ticket-dev-seed.ts
# demo-ticket:end

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

# The VPS deploy tests only: `just deploy` against stub images in a throwaway Compose project, and the automatic deployment poller against a stub GitHub API.
test-deploy-dry-run:
    INFRA_TESTS=1 corepack pnpm exec vitest run tests/infra/deploy-dry-run.test.ts tests/infra/autodeploy.test.ts

# Edge proxy (Optional piece `edge`). Both do nothing when `edge` is absent from COMPOSE_PROFILES.
# Production guards for the proxy: real domain and ACME email, public URL in step. Run before switching a release.
edge-guards:
    bash scripts/ops/edge-guards.sh

# Certificate expiry of the hostnames Caddy serves (warns, never fails).
cert-status:
    bash scripts/ops/cert-status.sh

# VPS deploy (Optional piece; docs/optional-pieces/vps-deploy.md). Run on the production host, from the release directory;
# the host timer runs `deploy` for each queued release. The release helpers are in scripts/ops/release-lib.sh and read
# COMPOSE_PROFILES: a piece that is not listed (edge, media, monitoring, backup) is skipped.

# Checks to run in CI or a non-production checkout before a release is cut. Nothing is migrated or seeded.
predeploy-check:
    @if [ "${NUXT_APP_ENV:-}" = "production" ]; then echo "Run predeploy-check in CI or a non-production checkout, never on the production host"; exit 1; fi
    just db-check
    just lint
    just typecheck
    just test
    just test-integration
    just build
    just test-e2e
    @echo "Pre-deploy checks passed. No production migrations or seeds were run."

# Jobs (migrate, seed, storage-init) run before any container is switched; a failure there aborts with the old
# release still running. A failure after the switch reverts the application to the previous release. The database
# is never rolled back. Missing backup configuration is visible but never blocks deployment.

# VPS deploy of a CI-built release: `just deploy <40-char-commit-sha>`. Never builds images on the host.
deploy sha:
    #!/usr/bin/env bash
    set -Eeuo pipefail
    source scripts/ops/release-lib.sh
    step="guard"; outcome="guard"
    trap 'echo "DEPLOY FAILED at step: ${step}" >&2' ERR
    trap 'rl_write_result "{{sha}}" "${outcome}" "${step}"' EXIT
    rl_guards "{{sha}}"
    outcome="aborted-before-switch"
    step="lock"; rl_lock
    previous_sha="$(rl_current_sha)"
    export APP_IMAGE_TAG="{{sha}}"
    step="pull images"; rl_pull
    step="verify images"; rl_verify_images
    step="backup-status"; rl_backup_status "{{sha}}"
    step="migrate"; docker compose run --rm migrate
    step="seed"; docker compose run --rm seed
    step="storage-init"; rl_storage_init
    step="start release and verify"
    trap - ERR
    if rl_switch "{{sha}}" "${release_services}" && { rl_monitoring; rl_backup_up; rl_verify; }; then
      rl_write_state "{{sha}}" "${previous_sha}"
      outcome="success"; step="done"
      echo "Deployed {{sha}} (previous: ${previous_sha:-none})."
    else
      echo "DEPLOY FAILED at step: ${step}" >&2
      rl_revert "${previous_sha}" && outcome="reverted" || { [ "$?" = 2 ] && outcome="revert-impossible" || outcome="revert-failed"; }
      exit 1
    fi

# Switch the application to an already-built release without running migrations or seeds.
rollback sha:
    #!/usr/bin/env bash
    set -Eeuo pipefail
    source scripts/ops/release-lib.sh
    step="guard"
    trap 'echo "ROLLBACK FAILED at step: ${step}" >&2' ERR
    rl_guards "{{sha}}"
    step="lock"; rl_lock
    # Rollback leaves the edge proxy as it is (its pinned base image is not tied to a release).
    release_image_services="${release_image_services% caddy}"
    live_sha="$(rl_current_sha)"
    export APP_IMAGE_TAG="{{sha}}"
    step="pull images"; rl_pull
    step="verify images"; rl_verify_images
    step="switch and verify"
    trap - ERR
    if rl_switch "{{sha}}" "${revert_services}" && rl_verify; then
      rl_write_state "{{sha}}" "${live_sha}"
      if [ -n "${live_sha}" ] && [ "${live_sha}" != "{{sha}}" ]; then rl_mark_attempted "${live_sha}"; fi
      echo "Rolled back to {{sha}} (was: ${live_sha:-none}). No migrations or seeds were run."
    else
      echo "ROLLBACK FAILED at step: ${step}" >&2
      rl_revert "${live_sha}" || true
      exit 1
    fi

# Current and previous release, automatic deployment state, container health, certificate expiry and backup warnings.
release-status:
    #!/usr/bin/env bash
    set -uo pipefail
    source scripts/ops/release-lib.sh
    if [ -f "${state_file}" ]; then
      echo "Release state (${state_file}):"; cat "${state_file}"
    else
      echo "No release recorded yet (${state_file} does not exist)."
    fi
    if [ -f "${pause_file}" ]; then echo "Automatic deployment is PAUSED (${pause_file}); run just autodeploy-resume to re-enable it."; fi
    bash scripts/ops/autodeploy-status.sh || true
    docker compose ps || true
    bash scripts/ops/cert-status.sh || true
    if rl_profile_on backup && just --show backup-status > /dev/null 2>&1; then just backup-status || true; fi
    if rl_profile_on monitoring && ! docker compose ps --status running --services | grep -qx glitchtip; then
      echo "WARNING: GlitchTip is not running; error tracking is unavailable (the app is unaffected)."
    fi

# Stop the automatic deployment poller from deploying (an incident switch). Manual deploys still work.
autodeploy-pause:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/ops/release-lib.sh
    mkdir -p "${state_dir}" && touch "${pause_file}"
    echo "Automatic deployment paused (${pause_file})."

# Let the automatic deployment poller deploy again.
autodeploy-resume:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/ops/release-lib.sh
    rm -f "${pause_file}"
    echo "Automatic deployment resumed."

# Remove release images and release directories that are neither the current nor the previous release. In-use images are never removed.
prune-images:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/ops/release-lib.sh
    [ -f "${state_file}" ] || rl_fail "No release recorded in ${state_file}; refusing to prune without knowing which releases to keep"
    keep_current="$(. "${state_file}"; echo "${CURRENT_SHA:-}")"
    keep_previous="$(. "${state_file}"; echo "${PREVIOUS_SHA:-}")"
    [ -n "${keep_current}" ] || rl_fail "State file has no current release; refusing to prune"
    repo="${APP_IMAGE_REPO:-ghcr.io/default64bit/nuxt-admin-starter}"
    for image_repo in ${PRUNE_IMAGE_REPOS:-${repo}/app ${repo}/tools ${repo}/backup}; do
      docker image ls "${image_repo}" --format '{{"{{"}}.Repository}}:{{"{{"}}.Tag}}' | while read -r ref; do
        tag="${ref##*:}"
        if [ "${tag}" = "${keep_current}" ] || [ "${tag}" = "${keep_previous}" ]; then continue; fi
        docker rmi "${ref}" || echo "Skipped ${ref} (in use)"
      done
    done
    # Release directories live as releases/<full-sha>/ next to this one; only that layout is ever touched.
    releases_dir="$(dirname "$(pwd -P)")"
    if [ "$(basename "${releases_dir}")" = "releases" ]; then
      for dir in "${releases_dir}"/*/; do
        name="$(basename "${dir}")"
        [[ "${name}" =~ ^[0-9a-f]{40}$ ]] || continue
        if [ "${name}" = "${keep_current}" ] || [ "${name}" = "${keep_previous}" ] || [ "${dir%/}" = "$(pwd -P)" ]; then continue; fi
        rm -rf -- "${dir}" && echo "Removed release directory ${name}"
      done
    fi

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
