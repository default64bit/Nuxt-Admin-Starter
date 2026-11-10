#!/usr/bin/env bash
# Pull-based automatic deployment poller (docs/optional-pieces/vps-deploy.md). One run is one tick of
# nuxt-admin-starter-autodeploy.timer; installed on the VPS as /srv/nuxt-admin-starter/bin/autodeploy. Host tools only:
# bash, curl, jq, docker, flock, just. A tick with nothing new prints nothing; every event is one line for the journal.
#
# Configuration (production defaults; the AUTODEPLOY_* variables are test seams):
#   AUTODEPLOY_ROOT            /srv/nuxt-admin-starter
#   APP_IMAGE_REPO             ghcr.io/default64bit/nuxt-admin-starter (read from <root>/shared/.env when unset); the GitHub
#                              repository the Deployments belong to is this path without its registry host
#   AUTODEPLOY_REPO            <owner>/<repo>, overrides the repository derived from APP_IMAGE_REPO
#   AUTODEPLOY_API_URL         https://api.github.com
#   AUTODEPLOY_TOKEN_FILE      <root>/shared/github-deployments.token (mode 600; never on a command line)
#   AUTODEPLOY_STATE_DIR       <root>/shared/.deploy (= DEPLOY_STATE_DIR of `just deploy`)
set -uo pipefail

ROOT="${AUTODEPLOY_ROOT:-/srv/nuxt-admin-starter}"
ENV_FILE="${ROOT}/shared/.env"
env_value() { [ -f "${ENV_FILE}" ] && sed -n "s/^$1=//p" "${ENV_FILE}" | tail -n1 | tr -d "\"'\r"; }
IMAGE_REPO="${APP_IMAGE_REPO:-$(env_value APP_IMAGE_REPO)}"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/default64bit/nuxt-admin-starter}"
REPO="${AUTODEPLOY_REPO:-${IMAGE_REPO#*/}}"
API="${AUTODEPLOY_API_URL:-https://api.github.com}"
TOKEN_FILE="${AUTODEPLOY_TOKEN_FILE:-${ROOT}/shared/github-deployments.token}"
STATE_DIR="${AUTODEPLOY_STATE_DIR:-${ROOT}/shared/.deploy}"
RELEASES="${ROOT}/releases"
BUNDLE_REQUIRED="justfile compose.yaml compose.prod.yaml Caddyfile scripts ops"
BUNDLE_OPTIONAL="compose.dev.yaml"
# Steps of `just deploy` that run before anything is changed and that depend on the network or on a busy host:
# the deploy is delayed, never marked attempted.
TRANSIENT_STEPS=" lock pull-images verify-images backup-status "

pause_file="${STATE_DIR}/autodeploy.paused"
attempted_file="${STATE_DIR}/attempted-shas"
result_file="${STATE_DIR}/last-result.env"
pending_file="${STATE_DIR}/pending-report.json"
expiry_file="${STATE_DIR}/token-expiry"
token=""
work=""

log() { printf 'autodeploy: %s\n' "$*"; }
short() { printf '%s' "${1:0:7}"; }

cleanup() { if [ -n "${work}" ]; then rm -rf -- "${work}"; fi; }

# GitHub call. $1 method, $2 path, $3 optional JSON body file. Response body in ${work}/body. The token travels in a
# curl config read from stdin (printf is a shell builtin), so it never appears in any process's arguments.
api() {
  local method="$1" path="$2" body="${3:-}" code expiry
  local args=(-sS -o "${work}/body" -D "${work}/headers" -w '%{http_code}' --max-time 30 -X "${method}"
    -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28')
  if [ -n "${body}" ]; then args+=(-H 'Content-Type: application/json' --data-binary "@${body}"); fi
  : > "${work}/body"
  rm -f "${work}/headers"
  code="$(printf 'header = "Authorization: Bearer %s"\n' "${token}" | curl -K - "${args[@]}" "${API}${path}" 2> /dev/null)" || code="000"
  expiry="$(sed -n 's/^[Gg]ithub-[Aa]uthentication-[Tt]oken-[Ee]xpiration: *//p' "${work}/headers" 2> /dev/null | tr -d '\r' | head -n1)"
  if [ -n "${expiry}" ]; then printf '%s\n' "${expiry}" > "${expiry_file}"; fi
  case "${code}" in
    2??) return 0 ;;
    401) log "GitHub rejected the token (HTTP 401): renew it and replace ${TOKEN_FILE}"; token_rejected=1 ;;
    000) log "GitHub is unreachable (${method} ${path%%\?*}); will retry next tick" ;;
    *) log "GitHub answered HTTP ${code} to ${method} ${path%%\?*}; will retry next tick" ;;
  esac
  return 1
}

# Writes the pending-report record, tries to post it and removes it once GitHub accepted it. $1 deployment id,
# $2 sha, $3 state, $4 description, $5 optional environment_url. Returns 1 while the report is still pending.
report() {
  jq -n --argjson id "$1" --arg sha "$2" --arg state "$3" --arg description "$4" --arg url "${5:-}" \
    '{deployment_id: $id, sha: $sha, status: ({state: $state, description: $description[0:140]} + (if $url == "" then {} else {environment_url: $url} end))}' \
    > "${pending_file}.tmp" && mv "${pending_file}.tmp" "${pending_file}"
  send_pending
}

send_pending() {
  [ -f "${pending_file}" ] || return 0
  local id sha state
  id="$(jq -r '.deployment_id' "${pending_file}")"
  sha="$(jq -r '.sha' "${pending_file}")"
  state="$(jq -r '.status.state' "${pending_file}")"
  jq '.status' "${pending_file}" > "${work}/payload.json"
  if api POST "/repos/${REPO}/deployments/${id}/statuses" "${work}/payload.json"; then
    rm -f "${pending_file}"
    log "report posted: ${state} for $(short "${sha}")"
    return 0
  fi
  log "report pending: ${state} for $(short "${sha}") is kept and retried before anything else"
  return 1
}

# Plain status post that is not worth keeping when it fails (the Deployment simply stays as it was).
post_status() {
  jq -n --arg state "$2" --arg description "$3" '{state: $state, description: $description[0:140]}' > "${work}/payload.json"
  api POST "/repos/${REPO}/deployments/$1/statuses" "${work}/payload.json"
}

release_current_sha() { [ -f "${STATE_DIR}/release.env" ] && sed -n 's/^CURRENT_SHA=//p' "${STATE_DIR}/release.env" | tail -n1; }

# Pull the tools image and copy the deploy bundle into releases/<sha>/. Returns 1 for a transient failure.
prepare_release() {
  local sha="$1" image="${IMAGE_REPO}/tools:$1" tmp="${RELEASES}/.extract-$1" dir="${RELEASES}/$1" cid item
  if ! docker pull "${image}" > "${work}/pull.log" 2>&1; then
    log "transient: pulling $(short "${sha}") tools image failed; will retry next tick"
    tail -n 3 "${work}/pull.log"
    return 1
  fi
  if ! docker image inspect "${image}" > /dev/null 2>&1; then
    log "transient: tools image for $(short "${sha}") is not present after the pull; will retry next tick"
    return 1
  fi
  rm -rf -- "${tmp}"
  mkdir -p "${tmp}"
  cid="$(docker create "${image}" 2> /dev/null)" || { log "transient: could not create a container from the tools image of $(short "${sha}")"; rm -rf -- "${tmp}"; return 1; }
  for item in ${BUNDLE_REQUIRED}; do
    docker cp "${cid}:/app/${item}" "${tmp}/" > /dev/null 2>&1 || { log "transient: bundle extraction failed for ${item} of $(short "${sha}")"; docker rm -f "${cid}" > /dev/null 2>&1; rm -rf -- "${tmp}"; return 1; }
  done
  for item in ${BUNDLE_OPTIONAL}; do docker cp "${cid}:/app/${item}" "${tmp}/" > /dev/null 2>&1 || true; done
  docker rm -f "${cid}" > /dev/null 2>&1 || true
  rm -rf -- "${dir}"
  mv "${tmp}" "${dir}"
  ln -sfn "${ENV_FILE}" "${dir}/.env"
  return 0
}

# Sets state/description/url/attempted for the outcome in last-result.env. $1 sha.
map_outcome() {
  local sha="$1" outcome="" step="" key value reverted_to
  if [ -f "${result_file}" ]; then
    while IFS='=' read -r key value; do
      case "${key}" in SHA) result_sha="${value}" ;; OUTCOME) outcome="${value}" ;; STEP) step="${value}" ;; esac
    done < "${result_file}"
  fi
  attempted=1; transient=0; env_url=""
  if [ "${result_sha:-}" != "${sha}" ] || [ -z "${outcome}" ]; then
    state="failure"; description="deploy ended without a result; check the host before retrying"
    return
  fi
  case "${outcome}" in
    success)
      attempted=0; state="success"; description="Deployed $(short "${sha}")"
      env_url="$(env_value NUXT_PUBLIC_SITE_URL)" ;;
    guard)
      attempted=0; state="error"
      description="host configuration invalid: $(grep -v -e '^DEPLOY FAILED' -e '^$' "${work}/deploy.log" | tail -n1 | cut -c1-100)" ;;
    aborted-before-switch)
      if [[ "${TRANSIENT_STEPS}" == *" ${step} "* ]]; then
        attempted=0; transient=1; state="queued"; description="delayed at ${step}; will retry"
      else
        state="failure"; description="${step} failed; previous release still serving"
      fi ;;
    reverted)
      reverted_to="$(release_current_sha)"
      state="failure"; description="smoke check failed; reverted to $(short "${reverted_to}")" ;;
    revert-failed) state="failure"; description="REVERT FAILED, site may be down" ;;
    revert-impossible) state="failure"; description="failed, no previous release" ;;
    *) state="failure"; description="unknown deploy outcome; check the host" ;;
  esac
}

refresh_installed_poller() {
  local source="$1/scripts/ops/autodeploy.sh" target="${ROOT}/bin/autodeploy"
  [ -f "${source}" ] || return 0
  if [ -f "${target}" ] && cmp -s "${source}" "${target}"; then return 0; fi
  mkdir -p "${ROOT}/bin" && install -m 755 "${source}" "${target}.new" && mv -f "${target}.new" "${target}" \
    && log "refreshed the installed poller from $(short "$2")"
}

deploy_candidate() {
  local id="$1" sha="$2" dir="${RELEASES}/$2"
  prepare_release "${sha}" || return 0
  if ! post_status "${id}" in_progress "Deploying $(short "${sha}")"; then return 0; fi
  log "deploy started: $(short "${sha}")"
  rm -f "${result_file}"
  result_sha=""
  (cd "${dir}" && NUXT_APP_ENV=production DEPLOY_APPROVED=YES DEPLOY_STATE_DIR="${STATE_DIR}" just deploy "${sha}") < /dev/null 2>&1 | tee "${work}/deploy.log"
  map_outcome "${sha}"
  if [ "${transient}" = 1 ]; then
    log "transient: deploy of $(short "${sha}") delayed ($(sed -n 's/^STEP=//p' "${result_file}")); the Deployment goes back to queued"
  else
    log "deploy finished: $(short "${sha}") -> ${state}"
    if [ "${attempted}" = 1 ]; then
      mkdir -p "${STATE_DIR}" && { grep -qxF "${sha}" "${attempted_file}" 2> /dev/null || printf '%s\n' "${sha}" >> "${attempted_file}"; }
    fi
  fi
  report "${id}" "${sha}" "${state}" "${description}" "${env_url}"
  if [ "${state}" = "success" ]; then
    ln -sfn "${dir}" "${ROOT}/current"
    refresh_installed_poller "${dir}" "${sha}"
    (cd "${dir}" && NUXT_APP_ENV=production DEPLOY_STATE_DIR="${STATE_DIR}" just prune-images) < /dev/null 2>&1 || log "warning: just prune-images failed; run it by hand"
  fi
  return 0
}

tick() {
  local rows row id sha state_now candidates=() i newest_id newest_sha
  send_pending || return 0
  if [ -f "${pause_file}" ]; then
    if [ ! -f "${STATE_DIR}/autodeploy.paused-logged" ]; then
      log "paused: not deploying (just autodeploy-resume re-enables it)"
      : > "${STATE_DIR}/autodeploy.paused-logged"
    fi
    return 0
  fi
  rm -f "${STATE_DIR}/autodeploy.paused-logged"

  api GET "/repos/${REPO}/deployments?environment=production&per_page=10" || return 0
  mapfile -t rows < <(jq -r '.[] | select(.creator.login == "github-actions[bot]") | select(.sha | test("^[0-9a-f]{40}$")) | "\(.id) \(.sha)"' "${work}/body")
  for row in "${rows[@]}"; do
    id="${row%% *}"; sha="${row##* }"
    if grep -qxF "${sha}" "${attempted_file}" 2> /dev/null; then continue; fi
    api GET "/repos/${REPO}/deployments/${id}/statuses?per_page=1" || return 0
    state_now="$(jq -r '.[0].state // empty' "${work}/body")"
    if [ "${state_now}" = "queued" ]; then candidates+=("${row}"); fi
  done
  [ "${#candidates[@]}" -gt 0 ] || return 0

  newest_id="${candidates[0]%% *}"; newest_sha="${candidates[0]##* }"
  log "candidate: $(short "${newest_sha}") (Deployment ${newest_id})"
  for ((i = 1; i < ${#candidates[@]}; i++)); do
    id="${candidates[i]%% *}"; sha="${candidates[i]##* }"
    # A failed post must stop the tick: an older release left queued could otherwise be deployed after the newer one.
    post_status "${id}" inactive "superseded by $(short "${newest_sha}")" || return 0
    log "superseded: $(short "${sha}") by $(short "${newest_sha}")"
  done
  deploy_candidate "${newest_id}" "${newest_sha}"
}

# Days until the date in $1 (`date -d` syntax); negative when past.
days_until() { local epoch; epoch="$(date -d "$1" +%s 2> /dev/null)" || return 1; echo $(((epoch - $(date +%s)) / 86400)); }

daily_checks() {
  local today current="${ROOT}/current" days line site media errors profiles
  today="$(date -u +%F)"
  if [ "$(cat "${STATE_DIR}/daily-checks" 2> /dev/null)" = "${today}" ]; then return 0; fi
  printf '%s\n' "${today}" > "${STATE_DIR}/daily-checks"

  if [ -f "${expiry_file}" ] && days="$(days_until "$(cat "${expiry_file}")")" && [ "${days}" -lt 30 ]; then
    log "WARNING: the GitHub token expires in ${days} day(s) ($(cat "${expiry_file}")); create a new one and replace ${TOKEN_FILE}"
  fi
  if [ -f "${TOKEN_FILE}" ] && [ "$(stat -c '%a' "${TOKEN_FILE}")" != "600" ]; then
    log "WARNING: ${TOKEN_FILE} has mode $(stat -c '%a' "${TOKEN_FILE}"), expected 600"
  fi
  if [ -f "${current}/scripts/ops/cert-status.sh" ]; then
    site="$(env_value SITE_DOMAIN)"; media="$(env_value MEDIA_DOMAIN)"; errors="$(env_value ERRORS_DOMAIN)"; profiles="$(env_value COMPOSE_PROFILES)"
    COMPOSE_PROFILES="${profiles}" SITE_DOMAIN="${site}" MEDIA_DOMAIN="${media}" ERRORS_DOMAIN="${errors}" CADDY_ACME_CA="$(env_value CADDY_ACME_CA)" \
      bash "${current}/scripts/ops/cert-status.sh" 2> /dev/null | grep '^WARNING' | while IFS= read -r line; do log "${line}"; done
  fi
}

main() {
  token_rejected=0
  mkdir -p "${STATE_DIR}" "${RELEASES}" || { log "cannot create ${STATE_DIR} or ${RELEASES}"; return 1; }
  exec 8> "${STATE_DIR}/autodeploy.lock"
  flock -n 8 || return 0
  work="$(mktemp -d)"
  trap cleanup EXIT
  if [ ! -r "${TOKEN_FILE}" ]; then log "token file ${TOKEN_FILE} is missing or unreadable"; return 1; fi
  token="$(tr -d ' \t\r\n' < "${TOKEN_FILE}")"
  if [ -z "${token}" ]; then log "token file ${TOKEN_FILE} is empty"; return 1; fi
  tick
  daily_checks
  [ "${token_rejected}" = 0 ]
}

main "$@"
exit $?
