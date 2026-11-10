#!/usr/bin/env bash
# Database backups (Optional piece `backup`; docs/optional-pieces/backups.md). Runs inside the `backup` image, which is
# the pinned PostgreSQL image plus curl, so `pg_dump` always matches the server's major version.
#
#   backup run              the Compose service: one dump every day at BACKUP_AT (UTC), forever
#   backup now              dump and upload right now (`just backup-now`)
#   backup list             list the dumps in the bucket, oldest first
#   backup status           last-success check (`just backup-status`)
#   backup restore KEY [DB] restore a dump into a NEW scratch database (`just backup-restore`)
#
# The destination is any S3-compatible bucket, addressed path-style, signed with AWS Signature V4 by curl itself. Nothing
# here ever fails the stack: without a destination the service logs a warning and idles, and `status` reports it.
#
# Environment (all BACKUP_S3_* come from the Project's .env):
#   BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY   required for any upload or download
#   BACKUP_S3_REGION (us-east-1), BACKUP_S3_PREFIX (db)                                 optional
#   BACKUP_AT (03:30, UTC), BACKUP_RETENTION_DAYS (14), BACKUP_MAX_AGE_HOURS (36)       optional
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE                                              the superuser connection to dump
# Exit codes of `status`: 0 recent dump exists, 1 no dump or too old, 2 not configured, 3 bucket unreachable.
set -Eeuo pipefail

endpoint="${BACKUP_S3_ENDPOINT:-}"
bucket="${BACKUP_S3_BUCKET:-}"
access_key="${BACKUP_S3_ACCESS_KEY:-}"
secret_key="${BACKUP_S3_SECRET_KEY:-}"
region="${BACKUP_S3_REGION:-us-east-1}"
prefix="${BACKUP_S3_PREFIX:-db}"
prefix="${prefix#/}"; prefix="${prefix%/}"
[[ "${prefix}" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ ]] || { echo "BACKUP_S3_PREFIX may only use letters, digits, dot, dash, underscore and slash: ${prefix}" >&2; exit 1; }
at="${BACKUP_AT:-03:30}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
max_age_hours="${BACKUP_MAX_AGE_HOURS:-36}"
timeout_seconds="${BACKUP_S3_TIMEOUT:-1800}"
empty_sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

log() { printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
warn() { log "WARNING: $*" >&2; }
die() { log "ERROR: $*" >&2; exit 1; }

configured() { [ -n "${endpoint}" ] && [ -n "${bucket}" ] && [ -n "${access_key}" ] && [ -n "${secret_key}" ]; }
not_configured_message() { echo "no off-host destination is configured (set BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY and BACKUP_S3_SECRET_KEY); no database backup exists."; }

# One signed request: s3 METHOD PATH [curl arguments...]. The credentials go through a config file on a pipe, never the
# command line. Query strings are added by the caller with -G --data-urlencode.
s3() {
  local method="$1" path="$2"
  shift 2
  curl --silent --show-error --fail-with-body --max-time "${timeout_seconds}" -X "${method}" \
    --aws-sigv4 "aws:amz:${region}:s3" -K <(printf 'user = "%s:%s"\n' "${access_key}" "${secret_key}") \
    "$@" "${endpoint%/}/${bucket}${path}"
}

# Keys of the dumps under the prefix, oldest first (the timestamp in the name sorts chronologically).
list_keys() {
  local body
  # The query is part of the URL, not added with -G: curl signs the URL before it appends such data.
  body="$(s3 GET "/?list-type=2&prefix=${prefix//\//%2F}%2F" -H "x-amz-content-sha256: ${empty_sha256}")" || return 1
  printf '%s' "${body}" | grep -o '<Key>[^<]*</Key>' | sed -e 's/^<Key>//' -e 's/<\/Key>$//' | grep '\.dump$' | sort || true
}

# Epoch seconds of a key's timestamp (…-20260102T030405Z.dump).
key_epoch() {
  local stamp
  stamp="$(printf '%s' "$1" | sed -nE 's/.*-([0-9]{8})T([0-9]{6})Z\.dump$/\1 \2/p')"
  [ -n "${stamp}" ] || return 1
  local day="${stamp% *}" time="${stamp#* }"
  date -u -d "${day:0:4}-${day:4:2}-${day:6:2} ${time:0:2}:${time:2:2}:${time:4:2}" +%s
}

work_dir=""
cleanup() { if [ -n "${work_dir}" ]; then rm -rf "${work_dir}"; fi; }
trap cleanup EXIT

run_now() {
  configured || { warn "$(not_configured_message)"; return 2; }
  work_dir="$(mktemp -d)"
  local database="${PGDATABASE:-app}" stamp name file key sha size
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  name="${database}-${stamp}.dump"
  file="${work_dir}/${name}"
  key="${prefix}/${name}"
  log "dumping database ${database} ..."
  pg_dump --format=custom --file="${file}" || { warn "BACKUP FAILED: pg_dump failed"; return 1; }
  # A dump that pg_restore cannot read is not a backup: never upload one.
  pg_restore --list "${file}" > /dev/null || { warn "BACKUP FAILED: the dump is not readable by pg_restore"; return 1; }
  sha="$(sha256sum "${file}" | cut -d' ' -f1)"
  size="$(stat -c %s "${file}")"
  log "uploading ${size} bytes to ${bucket}/${key} ..."
  s3 PUT "/${key}" -T "${file}" -H "x-amz-content-sha256: ${sha}" > /dev/null || { warn "BACKUP FAILED: upload to ${bucket}/${key} failed"; return 1; }
  log "BACKUP OK ${key} (${size} bytes)"
  prune || warn "retention pruning failed; old dumps are kept until the next successful run"
  rm -rf "${work_dir}"; work_dir=""
}

# Deletes dumps older than the retention window, after a successful upload, and never the newest dump.
prune() {
  local keys newest cutoff key epoch
  keys="$(list_keys)" || return 1
  newest="$(printf '%s\n' "${keys}" | tail -n1)"
  cutoff=$(( $(date -u +%s) - retention_days * 86400 ))
  while IFS= read -r key; do
    [ -n "${key}" ] && [ "${key}" != "${newest}" ] || continue
    epoch="$(key_epoch "${key}")" || continue
    if [ "${epoch}" -lt "${cutoff}" ]; then
      s3 DELETE "/${key}" -H "x-amz-content-sha256: ${empty_sha256}" > /dev/null || return 1
      log "removed ${key} (older than ${retention_days} days)"
    fi
  done <<< "${keys}"
}

run_list() {
  configured || { warn "$(not_configured_message)"; return 2; }
  list_keys || { warn "cannot read bucket ${bucket}"; return 3; }
}

run_status() {
  if ! configured; then echo "WARNING: backups: $(not_configured_message)"; return 2; fi
  local keys newest epoch age count
  if ! keys="$(list_keys)"; then echo "WARNING: backups: cannot read bucket ${bucket} at ${endpoint}; last success unknown."; return 3; fi
  newest="$(printf '%s\n' "${keys}" | tail -n1)"
  if [ -z "${newest}" ]; then echo "WARNING: backups: no dump found under ${bucket}/${prefix}/ yet; run just backup-now and check the job logs."; return 1; fi
  count="$(printf '%s\n' "${keys}" | grep -c .)"
  epoch="$(key_epoch "${newest}")" || { echo "WARNING: backups: cannot read the time of ${newest}."; return 1; }
  age=$(( ($(date -u +%s) - epoch) / 3600 ))
  if [ "${age}" -gt "${max_age_hours}" ]; then
    echo "WARNING: backups: the last successful dump is ${age} hours old (limit ${max_age_hours}): ${newest}. Check the job logs (just logs backup)."
    return 1
  fi
  echo "Backups: last successful dump ${newest}, ${age} hours ago; ${count} dump(s) kept (${retention_days} days)."
}

# Restores into a database that does not exist yet and never touches the live one.
run_restore() {
  local key="${1:-}" scratch="${2:-}"
  [ -n "${key}" ] || die "usage: backup restore <key> [scratch-database-name]  (list the keys with: backup list)"
  configured || die "$(not_configured_message)"
  [[ "${key}" == */* ]] || key="${prefix}/${key}"
  [[ "${key}" =~ ^[A-Za-z0-9._/-]+$ && "${key}" != *..* ]] || die "invalid dump key: ${key}"
  [ -n "${scratch}" ] || scratch="restore_$(date -u +%Y%m%d_%H%M%S)"
  [[ "${scratch}" =~ ^[a-z][a-z0-9_]{0,62}$ ]] || die "invalid scratch database name: ${scratch} (lowercase letters, digits and underscores)"
  case "${scratch}" in "${PGDATABASE:-app}" | postgres | template0 | template1) die "refusing to restore into ${scratch}: pick a new scratch name" ;; esac
  work_dir="$(mktemp -d)"
  local file="${work_dir}/dump"
  log "downloading ${bucket}/${key} ..."
  s3 GET "/${key}" -H "x-amz-content-sha256: ${empty_sha256}" -o "${file}" || die "cannot download ${bucket}/${key}"
  pg_restore --list "${file}" > /dev/null || die "${key} is not a readable pg_dump archive"
  if [ "$(psql -d postgres -Atc "select count(*) from pg_database where datname = '${scratch}'")" != "0" ]; then die "database ${scratch} already exists; pick another name"; fi
  psql -d postgres -v ON_ERROR_STOP=1 -qc "create database \"${scratch}\"" || die "cannot create database ${scratch}"
  # Owners and grants are kept when the roles exist (the same cluster, or a copy of it). If they do not, retry without
  # them: the data is the same, only owned by the connecting superuser.
  if ! pg_restore --dbname="${scratch}" --exit-on-error "${file}"; then
    warn "restore with the original owners failed; retrying without owners and grants"
    psql -d postgres -qc "drop database \"${scratch}\"" && psql -d postgres -v ON_ERROR_STOP=1 -qc "create database \"${scratch}\"" || die "cannot recreate database ${scratch}"
    if ! pg_restore --dbname="${scratch}" --no-owner --no-acl --exit-on-error "${file}"; then
      psql -d postgres -qc "drop database \"${scratch}\"" || true
      die "restore failed; the scratch database ${scratch} was dropped"
    fi
  fi
  log "RESTORED ${key} into database ${scratch}. Inspect it, then drop it: DROP DATABASE ${scratch};"
}

# The Compose service: sleeps until the next BACKUP_AT, dumps, repeats. A failed run is logged and retried the next day.
run_service() {
  [[ "${at}" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || die "BACKUP_AT must be HH:MM in UTC, got ${at}"
  if configured; then log "nightly dump at ${at} UTC to ${bucket}/${prefix}/, keeping ${retention_days} days"; else warn "$(not_configured_message) The job stays idle."; fi
  trap 'exit 0' TERM INT
  local now next
  while true; do
    if configured; then
      now="$(date -u +%s)"
      next="$(date -u -d "today ${at}" +%s)"
      if [ "${next}" -le "${now}" ]; then next="$(date -u -d "tomorrow ${at}" +%s)"; fi
      sleep $(( next - now )) &
    else
      sleep 86400 &
    fi
    wait $! || true
    if configured; then run_now || warn "BACKUP FAILED; trying again at ${at} tomorrow"; fi
  done
}

case "${1:-run}" in
  run) run_service ;;
  now) run_now ;;
  list) run_list ;;
  status) run_status ;;
  restore) shift; run_restore "$@" ;;
  *) echo "usage: backup run|now|list|status|restore <key> [database]" >&2; exit 64 ;;
esac
