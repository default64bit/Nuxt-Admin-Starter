#!/usr/bin/env bash
# Verifies docs/architecture/vps-bootstrap-checklist.md from a dev machine: DNS, SSH authentication methods, firewall
# behaviour seen from outside, and the server state readable without sudo. Read-only; prints no secrets.
#   VPS_IP        public IPv4 address of the server (required)
#   SSH_TARGET    ssh host alias or user@host of the admin account, with key login (required)
#   ADMIN_USER    the admin account's login name (required; the only user sshd may allow)
#   DOMAIN        apex hostname of the site (required); www.<DOMAIN> is checked as well
#   EXTRA_HOSTS   more hostnames to check, space separated (the hosts of the media and monitoring pieces, if used)
#   DEPLOY_ROOT   home of the deploy account (default /srv/nuxt-admin-starter)
# Example: VPS_IP=203.0.113.10 SSH_TARGET=myvps ADMIN_USER=alice DOMAIN=admin.example.org scripts/ops/check-vps-bootstrap.sh
set -uo pipefail

: "${VPS_IP:?Set VPS_IP to the server's public IPv4 address}"
: "${SSH_TARGET:?Set SSH_TARGET to the ssh host alias (or user@host) of the admin account}"
: "${ADMIN_USER:?Set ADMIN_USER to the admin account's login name}"
: "${DOMAIN:?Set DOMAIN to the site's apex hostname}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/srv/nuxt-admin-starter}"
# shellcheck disable=SC2206
HOSTS=("${DOMAIN}" "www.${DOMAIN}" ${EXTRA_HOSTS:-})
# Every hostname must resolve directly to the VPS, with any CDN or DNS proxy off: Caddy obtains certificates with the
# HTTP-01/TLS-ALPN-01 challenges, which need the certificate authority to reach this host on ports 80/443.

fails=0
pass() { printf 'PASS  %s\n' "$1"; }
warn() { printf 'WARN  %s\n' "$1"; }
fail() { printf 'FAIL  %s  (checklist step %s)\n' "$1" "$2"; fails=$((fails + 1)); }

echo "== DNS (step 7)"
for host in "${HOSTS[@]}"; do
  for resolver in "https://dns.google/resolve" "https://cloudflare-dns.com/dns-query"; do
    answer="$(curl -s --max-time 10 -H 'accept: application/dns-json' "${resolver}?name=${host}&type=A" \
      | grep -o '"data":"[0-9.]*"' | cut -d'"' -f4 | sort -u | tr '\n' ' ')"
    name="${resolver#https://}"; name="${name%%/*}"
    if [ "${answer% }" = "${VPS_IP}" ]; then
      pass "${host} A ${VPS_IP} via ${name}"
    elif [ -z "${answer}" ]; then
      fail "${host} has no A record via ${name} (zone missing or not yet propagated)" 7
    else
      fail "${host} resolves to '${answer% }' via ${name}, expected only ${VPS_IP} (is a CDN or DNS proxy on?)" 7
    fi
  done
  aaaa="$(curl -s --max-time 10 -H 'accept: application/dns-json' "https://dns.google/resolve?name=${host}&type=AAAA" \
    | grep -o '"type":28,"TTL"' || true)"
  [ -n "${aaaa}" ] && warn "${host} has an AAAA record: make sure the server really serves IPv6, or remove it"
done

echo "== SSH authentication (steps 3 and 5)"
methods() {
  ssh -v -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no \
    -o PreferredAuthentications=password,keyboard-interactive "$1@${VPS_IP}" true 2>&1 \
    | grep -m1 'Authentications that can continue' | sed 's/.*continue: //' | tr -d '\r'
}
for user in root "${ADMIN_USER}"; do
  offered="$(methods "${user}")"
  if [ -z "${offered}" ]; then
    fail "could not reach sshd on ${VPS_IP}:22 as ${user}" 5
  elif [ "${offered}" = "publickey" ]; then
    pass "sshd offers only publickey to ${user} (password login is off)"
  else
    fail "sshd offers '${offered}' to ${user}; expected publickey only" 5
  fi
done
if ssh -o BatchMode=yes -o ConnectTimeout=10 "root@${VPS_IP}" true 2> /dev/null; then
  fail "root can log in with a key; PermitRootLogin must be no" 5
else
  pass "root login with your keys is refused"
fi
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "${SSH_TARGET}" true 2> /dev/null; then
  fail "key login as '${SSH_TARGET}' failed (check ~/.ssh/config Host alias, the key, or unlock it with ssh-add)" 3
  echo; echo "${fails} check(s) failed; remote checks skipped."; exit 1
fi
pass "key login as '${SSH_TARGET}' works"

echo "== Firewall as seen from outside (step 6)"
# ufw drops denied ports (connection times out) but lets allowed ones through, where a port with nothing
# listening answers with a fast refusal. A middlebox on the path (e.g. an ISP transparent proxy) can answer for
# ports the VPS does not listen on, so an outside result is compared with what really listens on the server.
listening=" $(ssh -o BatchMode=yes -o ConnectTimeout=10 "${SSH_TARGET}" \
  "ss -tlnH | awk '{print \$4}' | grep -v -E '^(127\\.|\\[::1\\]|.*%lo:)' | sed 's/.*://' | sort -un | tr '\\n' ' '") "
echo "INFO  ports listening on public interfaces of the VPS:${listening}"
probe_port() {
  local start end
  start=$(date +%s%N)
  if nc -z -w 4 "${VPS_IP}" "$1" 2> /dev/null; then echo open; return; fi
  end=$(date +%s%N)
  if [ $(((end - start) / 1000000)) -lt 3500 ]; then echo refused; else echo dropped; fi
}
for port in 22 80 443; do
  state="$(probe_port "${port}")"
  case "${state}" in
    refused) pass "tcp/${port} allowed (refused: nothing listens yet)" ;;
    open)
      case "${listening}" in
        *" ${port} "*) pass "tcp/${port} allowed (open)" ;;
        *) warn "tcp/${port} answers but nothing listens on the VPS (path interception); confirm the rule with 'sudo ufw status'" ;;
      esac ;;
    *) warn "tcp/${port} looks dropped; it must be allowed in ufw and in any firewall panel of your hosting provider" ;;
  esac
done
for port in 3000 5432 8000 9000 9001 8080; do
  state="$(probe_port "${port}")"
  case "${state}" in
    open)
      case "${listening}" in
        *" ${port} "*) fail "tcp/${port} listens publicly on the VPS and is reachable from outside; only 22/80/443 may be" 6 ;;
        *) warn "tcp/${port} answers from outside but nothing listens on the VPS: something on the network path intercepts it (not the server)" ;;
      esac ;;
    refused) warn "tcp/${port} answers with a refusal: is ufw enabled with 'default deny incoming'?" ;;
    *) pass "tcp/${port} blocked (${state})" ;;
  esac
done
for port in ${listening}; do
  case "${port}" in 22 | 80 | 443) ;; *) fail "tcp/${port} listens on a public interface of the VPS; bind it to 127.0.0.1" 6 ;; esac
done

echo "== Server state readable without sudo (steps 2-6)"
remote="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "${SSH_TARGET}" "ADMIN_USER='${ADMIN_USER}' DEPLOY_ROOT='${DEPLOY_ROOT}' bash -s" << 'REMOTE'
. /etc/os-release; echo "os=${ID}-${VERSION_ID}"
echo "tz=$(timedatectl show -p Timezone --value 2>/dev/null)"
echo "ntp=$(timedatectl show -p NTPSynchronized --value 2>/dev/null)"
echo "admin_groups=$(id -nG "${ADMIN_USER}" 2>/dev/null)"
echo "deploy_passwd=$(getent passwd deploy | cut -d: -f6,7)"
echo "deploy_home=$(stat -c '%U:%G %a' "${DEPLOY_ROOT}" 2>/dev/null)"
echo "hardening=$(grep -hiE '^(PermitRootLogin|PasswordAuthentication|KbdInteractiveAuthentication|AllowUsers)' /etc/ssh/sshd_config.d/00-hardening.conf 2>/dev/null | tr -s ' ' '=' | tr '\n' ',')"
echo "ufw_enabled=$(grep -h '^ENABLED=' /etc/ufw/ufw.conf 2>/dev/null)"
echo "fail2ban=$(systemctl is-active fail2ban 2>/dev/null)"
echo "autoupdates=$(grep -h 'Unattended-Upgrade "1"' /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null | wc -l)"
echo "docker=$(command -v docker >/dev/null && docker --version || echo none)"
REMOTE
)"
get() { printf '%s\n' "${remote}" | grep "^$1=" | cut -d= -f2-; }

os="$(get os)"; [ "${os}" = "ubuntu-24.04" ] && pass "OS ${os}" || warn "OS is ${os}; the checklist assumes ubuntu-24.04"
{ [ "$(get tz)" = "Etc/UTC" ] || [ "$(get tz)" = "UTC" ]; } && pass "timezone UTC" || fail "timezone is '$(get tz)', expected UTC" 2
[ "$(get ntp)" = "yes" ] && pass "clock synchronized" || warn "clock not NTP-synchronized (TLS validation needs correct time)"
case " $(get admin_groups) " in *" sudo "*) pass "${ADMIN_USER} is in sudo" ;; *) fail "${ADMIN_USER} is not in the sudo group" 3 ;; esac
case " $(get admin_groups) " in *" docker "*) warn "${ADMIN_USER} is in the docker group (root-equivalent); the plan keeps only deploy there" ;; esac
[ "$(get deploy_passwd)" = "${DEPLOY_ROOT}:/usr/sbin/nologin" ] && pass "deploy user has home ${DEPLOY_ROOT} and no login shell" \
  || fail "deploy user is '$(get deploy_passwd)', expected ${DEPLOY_ROOT}:/usr/sbin/nologin" 4
[ "$(get deploy_home)" = "deploy:deploy 750" ] && pass "${DEPLOY_ROOT} is deploy:deploy 750" || fail "${DEPLOY_ROOT} is '$(get deploy_home)'" 4
hardening="$(get hardening | tr '[:upper:]' '[:lower:]')"
for want in permitrootlogin=no passwordauthentication=no kbdinteractiveauthentication=no "allowusers=${ADMIN_USER}"; do
  case ",${hardening}" in *",${want},"*) pass "sshd drop-in sets ${want}" ;; *) fail "00-hardening.conf does not set ${want}" 5 ;; esac
done
[ "$(get ufw_enabled)" = "ENABLED=yes" ] && pass "ufw enabled" || fail "ufw is not enabled" 6
[ "$(get fail2ban)" = "active" ] && pass "fail2ban active" || warn "fail2ban is '$(get fail2ban)'"
[ "$(get autoupdates)" -ge 1 ] 2> /dev/null && pass "unattended security upgrades on" || warn "unattended-upgrades not enabled"
echo "INFO  docker: $(get docker)"

echo
if [ "${fails}" -eq 0 ]; then echo "All bootstrap checks passed."; else echo "${fails} check(s) failed."; exit 1; fi
