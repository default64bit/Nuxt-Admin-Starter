#!/usr/bin/env bash
# Shared release helpers sourced by the `deploy`, `rollback`, `release-status` and `prune-images` just recipes
# (docs/optional-pieces/vps-deploy.md). Expects the environment the justfile exports (.env, COMPOSE_FILE, COMPOSE_PROFILES).
# Requires util-linux `flock`, and curl for the smoke check. Optional pieces are read from COMPOSE_PROFILES (ADR-0029):
# a piece that is not listed is skipped.
# Test seams (deploy dry-run test only): DEPLOY_SERVICES, DEPLOY_STATE_DIR, SMOKE_ATTEMPTS, SMOKE_DELAY_SECONDS.

lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
state_dir="${DEPLOY_STATE_DIR:-.deploy}"
state_file="${state_dir}/release.env"
result_file="${state_dir}/last-result.env"
attempted_file="${state_dir}/attempted-shas"
pause_file="${state_dir}/autodeploy.paused"

rl_profile_on() { case ",${COMPOSE_PROFILES:-}," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

# Services that run an image of the release and are switched with it. Add a service here (and to `revert_services`) when
# it runs the app or tools image, such as a background worker. The edge proxy is switched with the release too, but is
# never reverted: its pinned base image is not tied to a release.
revert_services="app"
if [ -n "${DEPLOY_SERVICES:-}" ]; then
  release_services="${DEPLOY_SERVICES}"
elif rl_profile_on edge; then
  release_services="${revert_services} caddy"
else
  release_services="${revert_services}"
fi
# Images pulled and verified before anything changes: the release services and the one-shot jobs of the tools image.
release_image_services="${revert_services} migrate seed"
case " ${release_services} " in *" caddy "*) release_image_services="${release_image_services} caddy" ;; esac

rl_fail() { echo "$1" >&2; exit 1; }

# Whether the resolved configuration (every profile) defines service $1.
rl_has_service() { docker compose --profile '*' config --services 2> /dev/null | grep -qx "$1"; }

# Production-only, approved, correctly configured. $1 = full commit SHA.
rl_guards() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || rl_fail "Requires the full 40-character lowercase commit SHA of a CI-built release"
  [ "${NUXT_APP_ENV:-}" = "production" ] || rl_fail "Refusing unless NUXT_APP_ENV=production is explicitly set"
  [ "${DEPLOY_APPROVED:-}" = "YES" ] || rl_fail "Refusing unless DEPLOY_APPROVED=YES is explicitly set after CI checks passed"
  case "${NUXT_PUBLIC_SITE_URL:-}" in
    https://*) ;;
    *) rl_fail "Set NUXT_PUBLIC_SITE_URL to the public https:// origin in the production .env" ;;
  esac
  case "${NUXT_PUBLIC_SITE_URL}" in
    *example.com* | *localhost* | *127.0.0.1*) rl_fail "NUXT_PUBLIC_SITE_URL is still a placeholder or a local address; set the real production origin" ;;
  esac
  # Domain, ACME e-mail and public URL checks of the edge proxy; skipped by the script itself when `edge` is Off.
  bash "${lib_dir}/edge-guards.sh" || exit 1
}

# Refuse to run concurrently with another deploy/rollback. The lock is held until this process exits.
rl_lock() {
  mkdir -p "${state_dir}"
  exec 9> "${state_dir}/deploy.lock"
  flock -n 9 || rl_fail "Another deploy or rollback is already in progress (lock: ${state_dir}/deploy.lock); refusing to run concurrently"
}

# Prints the SHA of the release that is currently recorded as live (empty when none).
rl_current_sha() {
  if [ -f "${state_file}" ]; then (. "${state_file}"; echo "${CURRENT_SHA:-}"); fi
}

# $1 = new current SHA, $2 = previous SHA (may be empty).
rl_write_state() {
  mkdir -p "${state_dir}"
  printf 'CURRENT_SHA=%s\nPREVIOUS_SHA=%s\n' "$1" "$2" > "${state_file}.tmp" && mv "${state_file}.tmp" "${state_file}"
}

# Keeps only characters that are safe in a sourceable KEY=value file.
rl_token() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '-'; }

# Machine-readable outcome of the last deploy, so automation never parses output text.
# $1 = SHA, $2 = OUTCOME (success|guard|aborted-before-switch|reverted|revert-failed|revert-impossible), $3 = STEP.
rl_write_result() {
  mkdir -p "${state_dir}" || return 0
  printf 'SHA=%s\nOUTCOME=%s\nSTEP=%s\n' "$(rl_token "$1")" "$2" "$(rl_token "$3")" > "${result_file}.tmp" && mv "${result_file}.tmp" "${result_file}"
}

# Adds a SHA to the automation's attempted list (one per line, no duplicates). $1 = SHA.
rl_mark_attempted() {
  mkdir -p "${state_dir}"
  grep -qxF "$1" "${attempted_file}" 2> /dev/null || printf '%s\n' "$1" >> "${attempted_file}"
}

# Directory that holds release $1's own files: its sibling of the current release directory when it exists
# (releases/<sha>/), otherwise the current directory.
rl_release_dir() {
  local here parent
  here="$(pwd -P)"
  parent="$(dirname "${here}")"
  if [[ "$1" =~ ^[0-9a-f]{40}$ ]] && [ -d "${parent}/$1" ]; then echo "${parent}/$1"; else echo "${here}"; fi
}

# Pulls the images of the release (services $release_image_services; the profile of a service is enabled by naming it).
rl_pull() {
  docker compose pull ${release_image_services}
}

# Every image of the release must exist locally (pull happens first; compose `pull` can skip some images).
rl_verify_images() {
  docker compose config --images ${release_image_services} | sort -u | xargs -r -n1 docker image inspect > /dev/null
}

# Advisory off-host backup report; only with the `backup` piece on and its recipe present. Never fails a release.
rl_backup_status() {
  rl_profile_on backup || { echo "Backups are Off (profile backup not listed): skipping the backup report."; return 0; }
  if just --show backup-status > /dev/null 2>&1; then just backup-status "$1" || true; else echo "No backup-status recipe in this release: skipping the backup report."; fi
}

# Bucket and policy initialization of the media piece; a no-op unless `media` is listed and the release defines the job.
rl_storage_init() {
  rl_profile_on media || { echo "Media storage is Off (profile media not listed): skipping storage initialization."; return 0; }
  if rl_has_service storage-init; then docker compose run --rm storage-init; else echo "No storage-init job in this release: skipping storage initialization."; fi
}

# Best-effort start of the error tracker (profile `monitoring`): its absence never blocks or reverts a release.
rl_monitoring() {
  rl_profile_on monitoring || return 0
  just monitoring-up || echo "WARNING: GlitchTip could not be started; error tracking is unavailable (the app is unaffected)." >&2
  return 0
}

# $1 = release SHA, $2 = services to (re)create. Waits for container health.
rl_switch() {
  APP_IMAGE_TAG="$1" docker compose up -d --no-build --wait --wait-timeout 180 $2
}

# Smoke check of the app on its loopback port (liveness, readiness, landing page, sign-in page). The VPS has no Node:
# the check needs only curl.
rl_verify() {
  docker compose ps
  bash "${lib_dir}/smoke-check.sh" "http://127.0.0.1:${APP_HOST_PORT:-3000}"
}

# Restore the application to the release that was live before the switch, using that release's own files.
# $1 = that SHA (may be empty). Returns 2 when there is nothing to restore, 1 when the restore failed.
rl_revert() {
  if [ -z "$1" ]; then
    echo "REVERT IMPOSSIBLE: no previous release is recorded, so nothing was restored. Investigate immediately." >&2
    return 2
  fi
  local dir
  dir="$(rl_release_dir "$1")"
  echo "Reverting ${revert_services} to previous release $1 (files from ${dir}) ..." >&2
  if (cd "${dir}" && APP_IMAGE_TAG="$1" rl_switch "$1" "${revert_services}" && APP_IMAGE_TAG="$1" rl_verify); then
    echo "Reverted to previous release $1; it is serving and verified." >&2
  else
    echo "REVERT FAILED: previous release $1 could not be restored and verified. The site may be down; investigate immediately." >&2
    return 1
  fi
}
