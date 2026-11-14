#!/usr/bin/env bash
# Certificate expiry of every public hostname, read from the local Caddy with a loopback TLS handshake that sends the
# hostname as SNI (no outbound traffic, works behind a CDN proxy or not). Warns, never fails: informational output.
# Does nothing when the `edge` profile is Off (the Project's own proxy owns the certificates).
#   SITE_DOMAIN, MEDIA_DOMAIN, ERRORS_DOMAIN   hostnames to check (unset ones are skipped); www.SITE_DOMAIN is derived
#   CERT_STATUS_ADDR                           where Caddy listens (default 127.0.0.1:443)
#   CERT_WARN_DAYS                             warn threshold in days (default 14)
#   CADDY_ACME_CA                              when set, Let's Encrypt staging is active: warn
set -uo pipefail

case ",${COMPOSE_PROFILES:-}," in *",edge,"*) ;; *) echo "Edge profile is Off: no certificates managed here."; exit 0 ;; esac

addr="${CERT_STATUS_ADDR:-127.0.0.1:443}"
warn_days="${CERT_WARN_DAYS:-14}"

if ! command -v openssl > /dev/null 2>&1; then
  echo "WARNING: openssl is not installed on this host, so certificate expiry cannot be checked."
  exit 0
fi

echo "Certificate expiry (Caddy at ${addr}):"
for host in ${SITE_DOMAIN:-} ${SITE_DOMAIN:+www.${SITE_DOMAIN}} ${MEDIA_DOMAIN:-} ${ERRORS_DOMAIN:-}; do
  not_after="$(echo | timeout 10 openssl s_client -connect "${addr}" -servername "${host}" 2> /dev/null | openssl x509 -noout -enddate 2> /dev/null | sed -n 's/^notAfter=//p')"
  expiry_epoch=""
  if [ -n "${not_after}" ]; then expiry_epoch="$(date -d "${not_after}" +%s 2> /dev/null || true)"; fi
  if [ -z "${expiry_epoch}" ]; then
    echo "WARNING: ${host}: no certificate served by Caddy yet (not running, or not issued)."
    continue
  fi
  days=$(( (expiry_epoch - $(date +%s)) / 86400 ))
  expires="$(date -u -d "@${expiry_epoch}" +%Y-%m-%d)"
  if [ "${days}" -lt "${warn_days}" ]; then
    echo "WARNING: ${host}: certificate expires in ${days} day(s) (${expires}); renewal should have happened already, check the Caddy logs."
  else
    echo "${host}: certificate expires ${expires} (${days} days)"
  fi
done

if [ -n "${CADDY_ACME_CA:-}" ]; then
  echo "WARNING: CADDY_ACME_CA is set (${CADDY_ACME_CA}): certificates come from the staging CA and browsers do not trust them. Remove it from .env and redeploy once staging issuance succeeds."
fi
exit 0
