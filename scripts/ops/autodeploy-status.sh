#!/usr/bin/env bash
# Automatic-deployment part of `just release-status`: an unposted report, the GitHub token's expiry, and installed
# systemd units / poller that differ from this release's copies. Informational: warns, never fails.
# Run from the release directory (`ops/systemd/` and `scripts/ops/` are read from the current directory).
#   DEPLOY_STATE_DIR        state directory (default .deploy)
#   AUTODEPLOY_ROOT         /srv/nuxt-admin-starter (holds bin/autodeploy)
#   SYSTEMD_UNIT_DIR        /etc/systemd/system
set -uo pipefail

state_dir="${DEPLOY_STATE_DIR:-.deploy}"
root="${AUTODEPLOY_ROOT:-/srv/nuxt-admin-starter}"
unit_dir="${SYSTEMD_UNIT_DIR:-/etc/systemd/system}"
installed_poller="${root}/bin/autodeploy"

if [ -f "${state_dir}/pending-report.json" ] && command -v jq > /dev/null 2>&1; then
  echo "Automatic deployment has an unposted report (retried every tick, before any new deploy): $(jq -r '"\(.status.state) for \(.sha[0:7]): \(.status.description)"' "${state_dir}/pending-report.json")"
fi

if [ -f "${state_dir}/token-expiry" ]; then
  expiry="$(cat "${state_dir}/token-expiry")"
  if epoch="$(date -d "${expiry}" +%s 2> /dev/null)"; then
    days=$(((epoch - $(date +%s)) / 86400))
    if [ "${days}" -lt 0 ]; then
      echo "WARNING: the GitHub Deployments token expired (${expiry}); automatic deployment cannot report or discover releases. Replace it."
    elif [ "${days}" -lt 30 ]; then
      echo "WARNING: the GitHub Deployments token expires in ${days} day(s) (${expiry}); create a new one and replace the token file."
    fi
  fi
fi

installed_any=0
for unit in ops/systemd/*.service ops/systemd/*.timer; do
  [ -f "${unit}" ] || continue
  name="$(basename "${unit}")"
  if [ ! -f "${unit_dir}/${name}" ]; then continue; fi
  installed_any=1
  if ! cmp -s "${unit}" "${unit_dir}/${name}"; then
    echo "WARNING: installed ${unit_dir}/${name} differs from this release's ${unit}; reinstall it (sudo install -m 644 ${unit} ${unit_dir}/ && sudo systemctl daemon-reload)."
  fi
done
if [ -f "${installed_poller}" ]; then
  installed_any=1
  if [ -f scripts/ops/autodeploy.sh ] && ! cmp -s scripts/ops/autodeploy.sh "${installed_poller}"; then
    echo "WARNING: ${installed_poller} differs from this release's scripts/ops/autodeploy.sh; it is refreshed after the next automatic deploy, or copy it by hand."
  fi
fi
if [ "${installed_any}" = 0 ]; then
  echo "Automatic deployment is not installed on this host (no nuxt-admin-starter-autodeploy units or poller found)."
fi
exit 0
