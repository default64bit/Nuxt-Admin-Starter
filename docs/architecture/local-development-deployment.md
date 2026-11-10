# Local development and deployment

## Scope

The project uses Node.js 24 LTS, pnpm 12 (repository-pinned), `just` as the developer-facing task runner and Docker Compose for the local stack and the Linux VPS deployment. The decisions behind it are ADR-0014 (configuration), ADR-0020 (CI/CD and deployment) and ADR-0029 (Optional pieces).

## First start

1. `cp .env.example .env`. Every variable has a safe dummy value; change `NUXT_SESSION_PASSWORD` to a real random secret (`openssl rand -hex 32`). If another project on your machine already uses port 5432 or 3000, change `POSTGRES_HOST_PORT` / `APP_HOST_PORT` and keep `DATABASE_URL`, `DATABASE_ADMIN_URL`, `NUXT_DATABASE_URL` and `NUXT_PUBLIC_SITE_URL` in step.
2. `just dev`. It builds the dev image, starts PostgreSQL, prepares the database (`just db-prepare`) and starts the Nuxt dev server with HMR on `http://127.0.0.1:3000`.
3. `just logs app`, `just shell app`, `just dev-down` (containers only) and `just dev-reset` (containers **and** volumes, local only, typed confirmation).

No host Node is needed to run the stack. Lint, typecheck, unit tests and the build still run on the host (`just install` first), as they do in CI.

## Canonical commands

Use `just --list`. The justfile exports `COMPOSE_FILE`, so recipes never pass `-f`; raw `docker compose` outside `just` sees only the base file.

- `just install` / `just ci-install`: install dependencies / reproducible install from the lockfile.
- `just dev`, `just up`: prepare the database, then start every service of the active profiles. In the dev stack both are the same; `up` is for a production-like run of the active stack.
- `just services-up` / `just services-down`: start / stop PostgreSQL (and the app on `services-down`) without preparing anything.
- `just db-prepare`: start PostgreSQL, ensure the database exists, apply committed pending migrations, apply seed versions that have not run. It stops at the first failing step and never creates migrations, deletes data or resets volumes.
- `just db-ensure`, `just db-migrate`, `just db-seed`: the three steps on their own. All are safe to repeat.
- `just db-generate <name>`: produce a migration from the Drizzle schema. Review and commit it; generation never applies it.
- `just db-check`: migration-chain consistency. Runs on the host and needs no database.
- `just db-push-local`: disposable local prototyping only; requires `NUXT_APP_ENV=local`. It must not be used elsewhere and does not replace reviewed migrations.
- `just compose-check`: validate the resolved dev and prod configurations (see below). `just test-compose` runs its tests.
- `just test-integration`: Postgres-backed tests on the host; needs `TEST_DATABASE_ADMIN_URL` (a role that may create and drop databases, for example the stack's `postgres` superuser on `POSTGRES_HOST_PORT`).

## Optional pieces: one list

`COMPOSE_PROFILES` in `.env` is the one switch for infrastructure Optional pieces. It is a comma-separated list of the profiles `media`, `monitoring`, `edge` and `backup`; Docker Compose reads it natively, so `docker compose up`, every `just` recipe and `just compose-check` agree on what runs. A fresh copy lists everything except `monitoring`. An empty list runs the core stack only: PostgreSQL and the app. Telegram and Web Push are not Compose services; they use their kill switches (ADR-0021, ADR-0029).

The profile `ops` holds the one-shot jobs (`db-ensure`, `migrate`, `seed`). It is never listed in `COMPOSE_PROFILES`; `docker compose run <job>` enables it on demand.

A service in an Optional piece's profile must never be required by an always-on service. If the app needs a piece, the dependency is `required: false` and the app reads the piece's missing configuration as "not configured". `compose-check` enforces this.

## Error tracking (GlitchTip, profile `monitoring`)

With `monitoring` in `COMPOSE_PROFILES`, `docker compose up` also runs `monitoring-db-init` (a one-shot job that creates GlitchTip's own role and database on the shared PostgreSQL) and then `glitchtip` on `127.0.0.1:${GLITCHTIP_HOST_PORT}`. `just monitoring-db-ensure` and `just monitoring-up` run them on their own. After first start, create the GlitchTip admin and a project in its UI and put the project's DSN in `NUXT_PUBLIC_GLITCHTIP_DSN` (browser; also adds the CSP report endpoint) and, optionally, `NUXT_GLITCHTIP_SERVER_DSN` (server; may use the internal `glitchtip` host and falls back to the public DSN). The SDK is initialised only when a DSN is set. Removal checklist: `docs/optional-pieces/glitchtip.md`.

## Compose layout

`compose.yaml` is the shared base; `compose.dev.yaml` and `compose.prod.yaml` are overlays chosen by the `stack` variable in the justfile (`dev`, or `prod` when `NUXT_APP_ENV=production`; `STACK` overrides). The Compose project name is the repository slug.

- **Base:** `postgres` (pinned by tag and digest, persistent named volume, health check, dedicated least-privilege app role created by `scripts/postgres/10-create-app-role.sh`), `app`, and the `ops` jobs. Every service has bounded `json-file` log rotation (10 MiB, 5 files). Host ports are bound to `127.0.0.1` only.
- **Dev overlay:** every Node service runs from the `dev` image target (`nuxt-admin-starter-dev:local`) as the unprivileged `node` user (`HOST_UID`/`HOST_GID`, default 1000), with the repository bind-mounted and `node_modules` in a named volume that `scripts/docker/dev-entrypoint.sh` keeps in sync with the lockfile. The app runs the Nuxt dev server with HMR.
- **Prod overlay:** registry images only, no `build:` sections: `ghcr.io/<owner>/<repo>/app:<APP_IMAGE_TAG>` (runtime target), `.../tools:<APP_IMAGE_TAG>` for the jobs, and base images mirrored under `.../base/` with the same tag and digest as in `compose.yaml`. Override the repository with `APP_IMAGE_REPO`.
- **Dockerfile targets:** `dev` (dependencies baked in, source mounted), `build` (internal), `tools` (source and tooling for migrations, seeds and any worker) and `runtime` (compiled `.output` only, non-root, `node .output/server/index.mjs`).

`just compose-check` resolves both stacks with every profile enabled and fails on: an unresolvable configuration or missing required variable; a floating or missing tag; a base image without a digest pin; a prod image outside the project's GHCR namespace or drifting from the base file's pin; a `build:` section in prod; a published port that is not loopback-bound; a service without log rotation; a profile that is not one of the known names; an unknown name in `COMPOSE_PROFILES`; and a running service that requires a service switched Off. It reads `.env` (or `.env.example` when there is none) and starts nothing.

## Idempotent database setup contract

1. Compose starts PostgreSQL with a persistent named volume. On a fresh volume the entrypoint creates the initial database and `scripts/postgres/10-create-app-role.sh` provisions the application role.
2. `scripts/db/ensure-database.mjs` needs the explicit `DATABASE_ADMIN_URL` maintenance connection (`DATABASE_ADMIN_URL_DOCKER` in the stack), checks `pg_database` and creates the target database only if it is missing. It never drops or recreates one, and the application role cannot create databases.
3. `drizzle-kit migrate` applies committed pending migrations through Drizzle's journal. A current database is left unchanged. App startup never applies migrations.
4. Seed versions are recorded in the database. Each is transactional and idempotent, and rerunning never overwrites data an admin edited.

Configuration reaches the containers through `runtimeConfig` (`NUXT_*` variables, ADR-0014). `DATABASE_URL` is the host and tooling URL; the stack overrides it with the `postgres` hostname through `DATABASE_URL_DOCKER`. Both must target the same intended database in an environment.

## Production images and release

CI builds the `runtime` and `tools` images once per commit and pushes them to GHCR tagged with the full commit SHA; the VPS only pulls them (ADR-0020). The production stack is `compose.yaml` plus `compose.prod.yaml` with `NUXT_APP_ENV=production` and `APP_IMAGE_TAG=<sha>`. Schema changes use expand/contract so reverting the app images never needs a destructive rollback. Release, deploy and rollback recipes, the edge proxy, error tracking and backups arrive with their Optional pieces and extend this document and the removal checklists under `docs/optional-pieces/`.
