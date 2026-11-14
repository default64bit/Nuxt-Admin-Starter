#!/usr/bin/env bash
# Smoke check of a running app: liveness, readiness, the landing page and the admin sign-in page. Used by the CI
# `all-off` job; it needs nothing beyond curl, so it works against any reachable base URL.
#   smoke-check.sh <base-url>        e.g. http://127.0.0.1:3000
# SMOKE_ATTEMPTS (default 30) and SMOKE_DELAY_SECONDS (default 2) bound the wait for the app to come up.
set -euo pipefail

base="${1:?usage: smoke-check.sh <base-url>}"
base="${base%/}"
attempts="${SMOKE_ATTEMPTS:-30}"
delay="${SMOKE_DELAY_SECONDS:-2}"
failed=0

# Fetches <path> until it answers 200 (or the attempts run out) and optionally requires <needle> in the body.
check() {
  local label="$1" path="$2" needle="${3:-}" body status=""
  body="$(mktemp)"
  for (( attempt = 1; attempt <= attempts; attempt++ )); do
    status="$(curl -sS -o "$body" -w '%{http_code}' --max-time 10 "${base}${path}" 2>/dev/null || true)"
    [ "$status" = "200" ] && break
    sleep "$delay"
  done
  if [ "$status" != "200" ]; then
    echo "FAIL ${label}: ${path} answered ${status:-no response}" >&2
    failed=1
  elif [ -n "$needle" ] && ! grep -q -- "$needle" "$body"; then
    echo "FAIL ${label}: ${path} answered 200 without ${needle}" >&2
    failed=1
  else
    echo "ok   ${label}: ${path}"
  fi
  rm -f "$body"
}

check liveness /api/health/live
check readiness /api/health/ready '"ready"'
check landing / '<h1'
check "admin sign-in" /sign-in '<form'
exit "$failed"
