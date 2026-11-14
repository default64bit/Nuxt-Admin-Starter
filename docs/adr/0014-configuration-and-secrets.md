# ADR-0014: Configuration and secrets

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Misconfiguration should fail at boot, not at the first request, and secrets must never reach the repository, the image, the logs or the client bundle.

## Decision

- All configuration goes through `runtimeConfig` in `nuxt.config.ts`. Private keys sit at the top level (server only); browser-safe values, such as the public site URL, sit under `runtimeConfig.public`.
- Environment variables map as `NUXT_<KEY>` and `NUXT_PUBLIC_<KEY>`; use only these names for app config. `DATABASE_URL` is the host and tooling URL read by `drizzle-kit`, and `NUXT_DATABASE_URL` is the Nuxt server's runtime URL. Both must target the same intended database in an environment. Compose overrides them with the internal `postgres` hostname.
- `NUXT_SESSION_PASSWORD` is a required high-entropy secret in non-test environments.
- Environment is validated at startup with a Zod schema in a Nitro plugin; the process fails fast with a readable error on missing or unsafe production configuration.
- `NUXT_SMS_PROVIDER` unset or blank resolves to `mock` in local and test and to `disabled` elsewhere; an explicit value always wins. `mock` and `disabled` are permitted only in local and test, so production validation fails when no SMS provider is configured. Provider-specific secret names are documented by their adapter.
- Optional pieces read as "not configured" when their keys are empty (media storage, the error-tracking DSN, Telegram, Web Push, backups). That is valid and never fails startup. `NUXT_ADMIN_CHANNEL_{TELEGRAM,PUSH}_ENABLED` are the Channel kill switches, and `COMPOSE_PROFILES` selects which infrastructure services run (ADR-0029).
- Object-storage root credentials are passed only to the storage service and its bootstrap task; the application uses a separately provisioned, least-privilege S3 identity.
- `.env.example` is committed with every variable and a safe dummy value, and `.env` and `.env.*` are gitignored. `.env.example` is never copied into production as a secret file without replacement.
- Secrets live in the hosting platform's secret store or a secret manager, never in the repo, the Docker image, logs or the client bundle. Rotate on suspicion of exposure. GitHub secret scanning and push protection are enabled.
- Do not branch on `NODE_ENV` for feature behavior; use explicit config flags (such as `APP_ENV` for local and test affordances).

## Consequences

- Positive: misconfiguration fails at boot, and no secret leaks into the client.
- Negative: every new variable touches three places (`nuxt.config.ts`, the schema, `.env.example`).
