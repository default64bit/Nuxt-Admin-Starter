#!/usr/bin/env bash
# Measures what the VPS can reach for installing Docker, pulling images, polling GitHub and issuing certificates. Run ON the
# VPS without sudo: `ssh <host> 'bash -s' < scripts/ops/vps-probe.sh`. Read-only; the output contains no secrets.
# A 401 from a registry's /v2/ means "reachable, needs auth" (good); 403/451 usually mean a geo or sanctions block; 000 means no connection (filtered, DNS failure or timeout).
set -uo pipefail

echo "# VPS reachability probe ($(date -u +%Y-%m-%dT%H:%MZ))"
echo
. /etc/os-release
echo "- OS: ${PRETTY_NAME}; kernel $(uname -r); $(nproc) CPU; RAM $(free -h | awk '/^Mem:/{print $2}'); disk / $(df -h / | awk 'NR==2{print $2" total, "$4" free"}')"
echo "- Resolvers: $(resolvectl dns 2>/dev/null | awk -F': ' 'NF>1{print $2}' | tr '\n' ' ' || grep nameserver /etc/resolv.conf | tr '\n' ' ')"
echo "- Public IPv6: $(ip -6 addr show scope global 2>/dev/null | grep -q inet6 && echo present || echo none)"
echo "- Clock synchronized: $(timedatectl show -p NTPSynchronized --value 2>/dev/null)"
echo

# label|url|expected http code(s). Add the mirrors or services your host needs to reach.
targets=(
  "Docker apt repo GPG|https://download.docker.com/linux/ubuntu/gpg|200"
  "get.docker.com|https://get.docker.com/|200"
  "GHCR registry|https://ghcr.io/v2/|401"
  "GHCR blob storage|https://pkg-containers.githubusercontent.com/|200 400 403 404"
  "GitHub API|https://api.github.com/zen|200"
  "GitHub web|https://github.com/|200"
  "Ubuntu archive|http://archive.ubuntu.com/ubuntu/dists/noble/Release|200"
  "Ubuntu security|http://security.ubuntu.com/ubuntu/dists/noble-security/Release|200"
  "Let's Encrypt ACME|https://acme-v02.api.letsencrypt.org/directory|200"
  "Let's Encrypt staging|https://acme-staging-v02.api.letsencrypt.org/directory|200"
)

printf '| Service | URL | HTTP | Time (s) | Verdict |\n| --- | --- | --- | --- | --- |\n'
notes=()
body="$(mktemp)"; trap 'rm -f "${body}"' EXIT
for entry in "${targets[@]}"; do
  IFS='|' read -r label url expected <<<"${entry}"
  : >"${body}"
  result="$(curl -sS -o "${body}" -w '%{http_code} %{time_total}' --max-time 20 "${url}" 2>/dev/null || true)"
  code="${result%% *}"; time="${result##* }"
  [ -z "${code}" ] && code="000"
  case " ${expected} " in
    *" ${code} "*) verdict="ok" ;;
    *) case "${code}" in
         000) verdict="UNREACHABLE" ;;
         403|451) verdict="BLOCKED?" ;;
         *) verdict="unexpected" ;;
       esac
       # The first bytes tell a vendor geo-block apart from a national filter page.
       snippet="$(head -c 120 "${body}" 2>/dev/null | tr -d '\r' | tr '\n|`' '   ')"
       [ -n "${snippet}" ] && notes+=("- ${label} (${code}): \`${snippet}\`") ;;
  esac
  printf '| %s | %s | %s | %s | %s |\n' "${label}" "${url}" "${code}" "${time:-–}" "${verdict}"
done
if [ "${#notes[@]}" -gt 0 ]; then
  printf '\nResponse snippets for non-ok results:\n\n'
  printf '%s\n' "${notes[@]}"
fi
echo
echo "Not covered here: an authenticated GHCR manifest/blob pull (needs the read:packages token) and inbound"
echo "reachability of ports 80/443 from the internet (checked from a dev machine and by an ACME staging issuance)."
