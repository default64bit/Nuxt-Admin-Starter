# ADR-0020: CI/CD and deployment

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

A Project needs repeatable releases that do not depend on a developer's machine, work on a single Linux VPS, and keep production credentials out of CI. Server deployment, the web edge, error tracking, media storage and backups are all Optional pieces (ADR-0029): each can be Off or Removed without touching the rest.

## Decision

### Runtime and Compose

- The Compose stack always has the Nuxt web service, a separate notification worker, PostgreSQL and a one-shot tooling profile (migrations, seeds). Optional pieces add services behind Compose profiles: RustFS object storage (`media`), GlitchTip (`monitoring`), Caddy (`edge`) and the backup job (`backup`). `COMPOSE_PROFILES` in `.env` is the one list of what runs (ADR-0029).
- PostgreSQL and RustFS use named persistent volumes with health checks. Database ports, RustFS S3 and its console are not public; host bindings are loopback-only. With Caddy on, it alone exposes ports 80 and 443. With Caddy Off, the Project brings its own proxy and the app port is published for it.
- Web runs the Nitro `node-server` output in a minimal non-root Node 24 image built from a multi-stage Dockerfile; the tools image also carries what migrations, seeds and the worker need.
- Compose is a shared base plus a **dev** overlay (Node services run from a `dev` image with the repository bind-mounted and `node_modules` in a named volume, HMR on) and a **prod** overlay (registry images only, no `build:` sections). `just compose-check` validates both resolved configurations. Images are pinned to supported major/minor versions; no floating `latest` in production.
- `justfile` recipes are the supported human interface; CI calls the same recipes.

### CI (GitHub Actions)

`ci.yml` runs on pushes to `develop`, pull requests to `main`, and `workflow_call`. It cancels superseded `develop` and pull-request runs, never `main` or tag runs. Jobs:

1. `checks`: install (frozen lockfile), database check, lint, typecheck, unit and component tests, build, and `perf:chart-chunk` (ADR-0025).
2. `integration`: tests that need a Postgres service container, including migrating from scratch.
3. `deploy-automation`: `just compose-check` and every infra test that needs Docker (compose, deploy dry-run, Caddy, autodeploy, release workflow). Each test runs in exactly one job.
4. `security`: `pnpm audit --audit-level high` and gitleaks.
5. `e2e`: Playwright against the built app in three Chromium shards, then the `@cross-browser` subset in Firefox and WebKit. One retry; flaky tests are reported, not hidden. The accessibility gate is the axe assertions inside the specs (ADR-0017). The report is kept as an artifact on failure; no change filter.
6. `all-off`: empty `COMPOSE_PROFILES` and no Channel keys. It builds, migrates, runs the production seed, starts the built app and runs the smoke checks (liveness, readiness, landing page, sign-in page). This proves every Optional piece is genuinely Off-able.

All jobs are required, non-strict status checks on `main`. Pushes to `develop` gate nothing.

### Release and deployment

- `release-images.yml` runs on pushes to `main`, `v*` tags and manual dispatch. It calls `ci.yml`, builds the `runtime` and `tools` images once per commit, pushes them to GitHub Container Registry tagged with the full commit SHA (a `vX.Y.Z` tag aliases the same digest), then queues a `production` GitHub Deployment. Base images are mirrored into the same namespace and pinned by digest, so production pulls from one registry with one read-only credential. Images are never built on the VPS.
- **Manual dispatch** takes `runner` (hosted or self-hosted) and `skip_ci`. It exists for when hosted capacity is the bottleneck. `skip_ci` is honored only on `main`; a failed or cancelled CI always blocks the release, and only an intentional skip passes. It is a per-run, owner-accepted exception, not a default.
- **VPS deployment is an Optional piece.** It is pull-based: a systemd timer on the VPS finds the newest queued Deployment, extracts that release's deploy files from its tools image, runs `just deploy <sha>` with the Deployment as approval, and reports Deployment statuses with a repository-scoped token. GitHub never holds a credential to the VPS, and CI is not an attack path to production. With the piece Off the timer is not installed; CI still builds the images.
- `just deploy <sha>` validates guards (production, `DEPLOY_APPROVED=YES`, real domains, a full 40-character SHA) and takes a host lock. It then pulls and verifies the images; runs one-shot migrations, versioned seeds and storage initialization (any failure aborts with the old release still serving; the database is never rolled back); switches web, worker and edge to the new tag and waits for health; best-effort starts GlitchTip; runs the smoke check (liveness, readiness, landing page); and records the release in a host-local state file. If anything fails after the switch, web and worker revert to the previous release and are re-verified. The command still exits non-zero and says whether the revert worked. Failures from the migration step onward are never retried automatically; network and registry failures only delay.
- App startup never applies schema migrations. Schema changes use expand/contract so reverting images never needs a destructive rollback (ADR-0007).
- `just rollback <sha>`, `just release-status` and `just prune-images` (which always keeps the current and previous releases) complete the operator surface.
- **Caddy** terminates HTTPS for the app and, with monitoring on, the errors host, using its own HTTP-01 and TLS-ALPN-01 challenges. The stock image is digest-pinned and mirrored to GHCR; there is no DNS provider key. Certificate and account data are persisted so renewal survives container recreation. Caddy overwrites `X-Forwarded-For` for the app.
- **Backups** (Optional piece): a nightly `pg_dump -Fc` to an off-host S3-compatible bucket, 14 dailies kept, with `just backup-now` and `just backup-restore <key>` (restore into a scratch database). The database only; media is not backed up. A missing destination is an operational warning and never blocks CI, startup or deployment, and no deploy claims off-host protection is active.
- GlitchTip availability, DSNs and its database initialization never block core app startup, CI or deployment.
- One production environment on one VPS is the baseline; the overlay structure does not prevent adding staging. Each environment has its own database and secrets.
- Other hosts (serverless, other Nitro presets) are possible, but connection pooling must be re-evaluated per platform.

## Alternatives considered

- Push-based deploy over SSH from CI: puts a production credential in GitHub.
- Building images on the VPS: slow, unreproducible and needs build tooling in production.
- A separate staging stack in the baseline: cost without a Project that needs it yet.

## Consequences

- Positive: repeatable, safe releases; automatic revert; production credentials stay on the VPS.
- Negative / trade-offs: more pipeline to maintain; a polling delay of up to two minutes before a release starts; certificate issuance needs the certificate authority to reach the VPS on ports 80 and 443.
- Follow-ups: media backups and point-in-time recovery are out of the baseline; add them if a Project's recovery objectives need them.
