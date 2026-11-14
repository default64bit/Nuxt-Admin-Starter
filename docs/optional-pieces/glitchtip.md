# GlitchTip (error tracking): Off and Removed

Self-hosted, Sentry-compatible error tracking (ADR-0015, ADR-0029). The app sends server and browser **errors only** (no tracing, no replay) through `@sentry/nuxt`, and the CSP reports to GlitchTip. Everything is gated by a DSN, so the app never depends on GlitchTip being present.

## Off (no code change)

1. Remove `monitoring` from `COMPOSE_PROFILES` in `.env`. The `glitchtip` and `monitoring-db-init` services no longer start (`just dev-down` stops running ones; the data stays in the `glitchtip` database).
2. Leave `NUXT_PUBLIC_GLITCHTIP_DSN` and `NUXT_GLITCHTIP_SERVER_DSN` empty. An empty DSN means not configured: the SDK is never initialised, nothing is sent, and the page CSP carries no GlitchTip origin and no `report-uri` (so there is no CSP report endpoint).
3. Release guards drop the errors domain: `ERRORS_DOMAIN` is only required while `monitoring` is in `COMPOSE_PROFILES`.
4. The Caddy edge serves no errors host: with `ERRORS_DOMAIN` empty, `CADDY_ERRORS_SITE` is empty and `ops/caddy/pieces/errors.caddy` is not imported.

Nothing else changes: readiness, sign-in, the shell and the test suites do not use GlitchTip.

## Removed (delete it for good)

Do Off first, then delete the following.

**Dependency and configuration**

- `package.json`: the `@sentry/nuxt` dependency and the `monitoring:db:ensure` script. Run `pnpm install` to refresh `pnpm-lock.yaml`.
- `nuxt.config.ts`: `"@sentry/nuxt/module"` in `modules`, the `sentry: { ... }` block, `vite.define.__SENTRY_TRACING__`, and `runtimeConfig.glitchtipServerDsn` and `runtimeConfig.public.glitchtipDsn`.
- `sentry.server.config.ts` and `sentry.client.config.ts` (repository root).
- `shared/utils/error-capture.ts` and `tests/unit/shared/error-capture.test.ts`.
- `server/utils/csp.ts`: the `errorOrigin` and `reportUri` options of `buildCsp`, `reportingFromDsn`, and the `parseDsn` import. `server/plugins/csp.ts`: the `reporting` lines that feed them. Update `tests/unit/server/csp.test.ts` accordingly.
- Wherever the runtime config comments mention error tracking: `server/utils/runtime-config-schema.ts`.

**Services and scripts**

- `compose.yaml`: the `glitchtip` and `monitoring-db-init` services, and `NUXT_PUBLIC_GLITCHTIP_DSN` and `NUXT_GLITCHTIP_SERVER_DSN` in the `app` environment.
- `compose.dev.yaml`: `monitoring-db-init`. `compose.prod.yaml`: `monitoring-db-init`, `glitchtip`, and on `caddy` the `ERRORS_DOMAIN` and `CADDY_ERRORS_SITE` entries and the `glitchtip` dependency.
- `scripts/db/ensure-monitoring-database.mjs`.
- `justfile`: `monitoring-db-ensure` and `monitoring-up`.
- `scripts/ops/compose-check.mjs`: the `monitoring` entries of `PIECE_SERVICES` and `PIECE_PROFILES`, and `monitoring` from the known profiles. `scripts/ops/edge-guards.sh` and the release guards: the errors-domain check.
- `ops/caddy/pieces/errors.caddy`, and the errors-host import line in the `Caddyfile`.
- `ops/caddy/` tests or fixtures that name the errors host, and the GlitchTip base-image pin if the base-image mirror list names it.

**Environment**

- `.env.example` (and production environment templates): the `GLITCHTIP_*` keys, `NUXT_PUBLIC_GLITCHTIP_DSN`, `NUXT_GLITCHTIP_SERVER_DSN`, `ERRORS_DOMAIN`, and `monitoring` in the `COMPOSE_PROFILES` comment.
- `tests/fixtures/compose-check.env`: any GlitchTip placeholder.

**Documentation**

- ADR-0015's exception-monitoring section and the GlitchTip row of ADR-0029 (record the removal as a superseding note), the `monitoring` profile in `docs/architecture/local-development-deployment.md`, and this file.

**Tables:** none. GlitchTip keeps its data in its own `glitchtip` database and `glitchtip_app` role on the shared PostgreSQL, outside the app's migrations. To reclaim it, run `DROP DATABASE glitchtip; DROP ROLE glitchtip_app;` as the PostgreSQL superuser (adjust the names if you changed `GLITCHTIP_DB_NAME` and `GLITCHTIP_DB_USER`).

**CI:** no job is specific to GlitchTip. `just compose-check` and `just test-compose` run unchanged once the entries above are gone.
