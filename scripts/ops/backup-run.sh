#!/usr/bin/env bash
# Runs one command of the backup job (scripts/backup/backup.sh) in a throwaway container of the `backup` service:
# `just backup-now|backup-status|backup-restore` call this. Works from the dev and the production stack alike.
#   backup-run.sh now | list | status | restore <key> [scratch-database]
# Backups are an Optional piece (ADR-0029): with `backup` absent from COMPOSE_PROFILES nothing runs. `status` then
# exits 0 (it is only informational), every other command exits 1.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/ops/release-lib.sh

command="${1:?usage: backup-run.sh now|list|status|restore <key> [scratch-database]}"
shift
if ! rl_profile_on backup; then
  echo "Backups are Off (profile backup is not listed in COMPOSE_PROFILES)."
  [ "${command}" = "status" ] && exit 0
  exit 1
fi
# The production overlay names the image by release SHA; the commands run from the release that is live.
export APP_IMAGE_TAG="${APP_IMAGE_TAG:-$(rl_current_sha)}"
# Dumping and restoring need the database (the run starts PostgreSQL); listing and the status check only talk to the bucket.
deps=()
if [ "${command}" = "status" ] || [ "${command}" = "list" ]; then deps=(--no-deps); fi
exec docker compose run --rm -T "${deps[@]}" backup "${command}" "$@"
