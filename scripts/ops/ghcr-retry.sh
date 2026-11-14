#!/usr/bin/env bash
# Runs a GHCR push command, retrying only the 403 "write_package" denial a package can get on its FIRST push: the
# first write creates the package, and the next write is denied until GHCR links it to the repository. Any other
# failure is returned at once.
#   ghcr-retry.sh <command> [args...]
# GHCR_RETRY_ATTEMPTS (default 3) bounds the attempts; GHCR_RETRY_DELAY_SECONDS (default 15) is the first backoff,
# doubled for each later retry.
set -uo pipefail
[ "$#" -gt 0 ] || { echo "usage: ghcr-retry.sh <command> [args...]" >&2; exit 2; }

attempts="${GHCR_RETRY_ATTEMPTS:-3}"
delay="${GHCR_RETRY_DELAY_SECONDS:-15}"
stderr_log="$(mktemp)"
trap 'rm -f "$stderr_log"' EXIT

for (( attempt = 1; ; attempt++ )); do
  # stdout passes through; stderr is shown and kept for the denial check.
  { "$@" 2>&1 1>&3 3>&- | tee "$stderr_log" >&2; status=${PIPESTATUS[0]}; } 3>&1
  [ "$status" -eq 0 ] && exit 0
  if (( attempt >= attempts )) || ! grep -qE 'permission_denied: write_package|403 Forbidden' "$stderr_log"; then
    exit "$status"
  fi
  echo "ghcr-retry: GHCR denied the push (attempt ${attempt}/${attempts}); retrying in ${delay}s" >&2
  sleep "$delay"
  delay=$(( delay * 2 ))
done
