# Caddy (edge proxy)

Optional piece, ADR [0029](../adr/0029-optional-pieces.md). Caddy terminates HTTPS in the production stack with automatic Let's Encrypt certificates (Caddy's own HTTP-01 and TLS-ALPN-01 challenges, no DNS provider key) and passes the TCP peer address to the app as `X-Forwarded-For`. It serves the site hostname, redirects `www.` to it, and hosts the sites of other Optional pieces (media, error tracking) through the files in `ops/caddy/pieces/`.

## Off

No code change.

1. Remove `edge` from `COMPOSE_PROFILES` in the production `.env`.
2. Run your own proxy on the server and point it at the app on `127.0.0.1:${APP_HOST_PORT}` (default 3000; the shared Compose file always publishes it on the loopback only). Forward the visitor address as the leftmost `X-Forwarded-For` value, and replace any value the client sent.
3. Set `NUXT_PUBLIC_SITE_URL` to the public origin your proxy serves.

What changes: the `caddy` service does not start; the certificate volumes are kept but unused; `scripts/ops/edge-guards.sh` (`just edge-guards`) and `just cert-status` skip their ACME and domain checks and report that the edge is Off; `SITE_DOMAIN`, `ACME_EMAIL` and `CADDY_ACME_CA` are ignored. Everything else, including `just compose-check`, keeps working.

Turning it back on is the reverse, plus real `SITE_DOMAIN` and `ACME_EMAIL` values and DNS records that point straight at the server with ports 80 and 443 reachable. Use `CADDY_ACME_CA` with the Let's Encrypt staging directory for the first issuance only.

## Removed

Do Off first, then delete:

- **Files:** `Caddyfile`, `ops/caddy/` (`base-images.txt`, `pieces/`), `scripts/ops/edge-guards.sh`, `scripts/ops/cert-status.sh`.
- **Compose:** the `caddy` service and the `caddy-data` and `caddy-config` volumes in `compose.prod.yaml`.
- **Environment keys:** `SITE_DOMAIN`, `ACME_EMAIL`, `CADDY_ACME_CA` (and `MEDIA_DOMAIN`, `ERRORS_DOMAIN`, `CADDY_MEDIA_SITE`, `CADDY_ERRORS_SITE` if the media or error-tracking piece added them) from `.env.example`, the production environment template and your server's `.env`; the `edge` entry from the `COMPOSE_PROFILES` comment in `.env.example`.
- **`scripts/ops/compose-check.mjs`:** the `caddy` entry in `publicServices`, the `CADDY_BASE` pin and its checks, the `caddy` service rules (missing in prod, forbidden in dev), and `edge` from `PIECE_PROFILES`. Keep the rule that `app` publishes its loopback port: your own proxy depends on it.
- **justfile:** the `edge-guards` and `cert-status` recipes. If the release flow (VPS deploy piece) calls `edge-guards.sh`, `cert-status.sh` or lists `caddy` among the services it switches, drop those lines too.
- **Release images:** the Caddy line in the base-image mirror list used by the release workflow.
- **Tests and fixtures:** `tests/infra/caddy-certificates.test.ts`, `tests/infra/caddy-client-ip.test.ts`, `tests/infra/edge-guards.test.ts`, and the Caddy and app-port cases in `tests/infra/compose-check.test.ts`; `edge` from `COMPOSE_PROFILES` in `tests/fixtures/compose-check.env`.
- **CI:** nothing to change; the `deploy-automation` job runs whatever is left in `tests/infra`.
- **Dependencies and tables:** none. No drop migration.
- **Docs:** the Caddy row in ADR 0029 and the mentions in `README.md`.
