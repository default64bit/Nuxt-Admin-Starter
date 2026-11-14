#!/usr/bin/env bash
# Production guards for the edge proxy (Caddy, Optional piece `edge`). Reads the environment the justfile exports (.env).
# With `edge` absent from COMPOSE_PROFILES the Project brings its own proxy: every ACME and domain guard is skipped.
# The release flow calls this before it switches; it prints the first problem and exits non-zero, or exits 0.
#   COMPOSE_PROFILES     comma-separated Optional-piece profiles (ADR-0029)
#   SITE_DOMAIN          apex hostname Caddy serves (www.SITE_DOMAIN redirects to it); placeholder app.example.com
#   ACME_EMAIL           Let's Encrypt expiry notices; placeholder admin@example.com
#   MEDIA_DOMAIN, ERRORS_DOMAIN   hosts of the media and monitoring pieces; checked only when that piece's profile is on
set -euo pipefail

fail() { echo "$1" >&2; exit 1; }
on() { case ",${COMPOSE_PROFILES:-}," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
real() { [ -n "${1:-}" ] && [ "$1" != "$2" ]; }

if ! on edge; then
  echo "Edge profile is Off: skipping ACME and domain guards (the Project's own proxy terminates HTTPS)."
  exit 0
fi

real "${SITE_DOMAIN:-}" "app.example.com" || fail "Set SITE_DOMAIN to the real production hostname before enabling Caddy/HTTPS"
case "${SITE_DOMAIN}" in www.*) fail "SITE_DOMAIN must be the apex hostname without a www. prefix: Caddy serves www.\${SITE_DOMAIN} as a redirect to it" ;; esac
real "${ACME_EMAIL:-}" "admin@example.com" || fail "Set ACME_EMAIL for Let's Encrypt certificate notifications"
[ "${NUXT_PUBLIC_SITE_URL:-}" = "https://${SITE_DOMAIN}" ] || fail "Set NUXT_PUBLIC_SITE_URL=https://${SITE_DOMAIN} in production .env"
if on media; then real "${MEDIA_DOMAIN:-}" "media.example.com" || fail "Set a real MEDIA_DOMAIN: the media profile is on and Caddy serves its host"; fi
if on monitoring; then real "${ERRORS_DOMAIN:-}" "errors.example.com" || fail "Set a real ERRORS_DOMAIN: the monitoring profile is on and Caddy serves its host"; fi
echo "Edge guards passed (${SITE_DOMAIN})."
