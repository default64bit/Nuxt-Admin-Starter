# VPS bootstrap checklist (human-run)

Audience: the owner, setting up the production VPS for the first time. It prepares an empty Ubuntu server for the pull-based deploy described in [the VPS runbook](vps-runbook.md). Fill in the table, then work through the steps in order.

| Fact | Value |
| --- | --- |
| VPS | provider and region, `<VPS_IP>` |
| Admin account | `<admin-user>` (SSH key and `sudo` with a password) |
| Deploy account | `deploy` (system user, no login, owns `/srv/nuxt-admin-starter`) |
| Domain | `<domain>` (registrar and DNS provider; CDN or DNS proxy off for every hostname) |
| Hostnames | `<domain>`, `www.<domain>`, and `media.<domain>` / `errors.<domain>` while those pieces are on |

Each step ends with a **Verify** line. Everything is re-checked at the end by two scripts:

- `scripts/ops/check-vps-bootstrap.sh`, run from your own computer (a coding agent can run it too).
- `scripts/ops/vps-probe.sh`, run on the VPS. It measures which outside services the VPS can reach.

> **Never paste a password, private key or token into an issue, a comment or a chat.** The script outputs are safe to paste: they contain no secrets.

---

## 0. Before you start

1. In your provider's panel, confirm you can open the server's **web console (VNC/KVM)**. If an SSH or firewall mistake locks you out, that console is how you get back in. Note the root password the provider gave you.
2. Check the OS. Log in as root (`ssh root@<VPS_IP>`) and run `cat /etc/os-release`. This checklist assumes **Ubuntu 24.04 LTS**. If it is something else, reinstall Ubuntu 24.04 from the panel now; the server is empty, so this is the cheapest moment. On Debian 12/13 the steps also work, but first run `apt install sudo`.

**Verify:** `cat /etc/os-release` prints `VERSION_ID="24.04"`.

## 1. Create an SSH key on your own computer

Run on **your computer**, not the VPS. Use a dedicated key for this server, and give it a passphrase when asked:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/<project>_vps -C "<admin-user>@<project>-vps"
```

Add a host alias so that `ssh <alias>` works. `~/.ssh/config` may not exist yet; this creates it if needed (it must not be writable by others, or SSH ignores it) and appends the alias:

```bash
touch ~/.ssh/config && chmod 600 ~/.ssh/config
cat >> ~/.ssh/config <<'EOF'
Host <alias>
    HostName <VPS_IP>
    User <admin-user>
    IdentityFile ~/.ssh/<project>_vps
    IdentitiesOnly yes
EOF
```

**Verify:** `ls ~/.ssh/<project>_vps ~/.ssh/<project>_vps.pub` lists both files, and `ssh -G <alias> | grep -E '^(hostname|user|identityfile) '` prints the address, the admin user and the key. `ssh <alias>` itself only works after step 3.

## 2. Update the server and set basics (as root)

```bash
apt update && apt full-upgrade -y
hostnamectl set-hostname <project>-prod
timedatectl set-timezone UTC          # persisted timestamps are UTC
apt install -y ufw fail2ban unattended-upgrades curl ca-certificates jq
dpkg-reconfigure -f noninteractive unattended-upgrades   # enables automatic security updates
reboot                                # if the upgrade installed a new kernel
```

If `apt update` hangs or fails on the default archive, switch the sources in `/etc/apt/sources.list.d/ubuntu.sources` to a mirror that is reachable from your host (`scripts/ops/vps-probe.sh` shows what is), then rerun the commands above.

**Verify:** `timedatectl` shows `Time zone: Etc/UTC` and `System clock synchronized: yes`.

## 3. Create your admin user (as root)

```bash
adduser <admin-user>                 # choose a strong password: it is your sudo password
usermod -aG sudo <admin-user>
```

Then, from **your computer**, install your public key for the admin user. This still uses a password, which is disabled in step 5:

```bash
ssh-copy-id -i ~/.ssh/<project>_vps.pub <admin-user>@<VPS_IP>
```

**Verify (on your computer, in a NEW terminal):** `ssh <alias>` logs you in without asking for the account password (only the key passphrase, if you set one), and `sudo -v` then accepts your password.

## 4. Create the `deploy` service account (as the admin user, with sudo)

`deploy` runs the automated deployments later. It has no password and no login shell, and nobody SSHes in as it.

```bash
sudo adduser --system --group --home /srv/nuxt-admin-starter --shell /usr/sbin/nologin deploy
sudo chmod 750 /srv/nuxt-admin-starter
```

It is added to the `docker` group in step 9, after Docker is installed. Membership in the `docker` group is root-equivalent, which is why the admin user is **not** added to it.

**Verify:** `getent passwd deploy` ends in `/srv/nuxt-admin-starter:/usr/sbin/nologin`, and `stat -c '%U:%G %a' /srv/nuxt-admin-starter` prints `deploy:deploy 750`.

## 5. Harden SSH (as the admin user)

**Keep your current SSH session open** until the new login is proven in a second terminal.

One line, no heredoc: heredocs pasted into a terminal can fail silently and leave the file unwritten. The file name sorts before most provider drop-ins, and sshd keeps the first value it reads for each setting, so these win over a permissive main `sshd_config`:

```bash
printf '%s\n' 'PermitRootLogin no' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PubkeyAuthentication yes' 'AllowUsers <admin-user>' 'MaxAuthTries 3' | sudo tee /etc/ssh/sshd_config.d/00-hardening.conf && sudo sshd -t && sudo systemctl restart ssh
```

`sshd -t` must print nothing. If it prints an error, fix the file before restarting.

**Verify (in a NEW terminal on your computer):**

- `ssh <alias>` still works.
- `ssh -o PubkeyAuthentication=no root@<VPS_IP>` is refused with `Permission denied (publickey)`.
- On the VPS, `sudo sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication)'` prints `no` for all three.

## 6. Firewall (as the admin user)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo systemctl enable --now fail2ban    # default config protects sshd
```

Note for later: ports that Docker publishes bypass ufw. That is why the Compose files bind PostgreSQL, object storage and GlitchTip to `127.0.0.1` only, and only the edge proxy publishes 80 and 443. If your provider's panel also has a network firewall, allow the same four rules there. With the edge proxy Off, open only the ports your own proxy needs.

**Verify:** `sudo ufw status verbose` shows `Status: active`, `Default: deny (incoming)` and exactly the four ALLOW rules (plus their v6 twins). `sudo fail2ban-client status sshd` shows the jail.

After Docker is installed, check whether the optional TCP MSS clamp is needed (`ops/systemd/mss-clamp.service`, see `vps-runbook.md` section 1): only enable it if HTTPS handshakes time out from some networks while plain HTTP works.

## 7. DNS

Create these **A** records at your DNS provider, each with TTL 300 (raise it to 3600 once everything works), pointing straight at the VPS with any **CDN or DNS proxy off**: the edge proxy obtains certificates with the HTTP-01/TLS-ALPN-01 challenges, which a proxy would intercept.

| Name | Type | Value | Proxy |
| --- | --- | --- | --- |
| `@` (apex) | A | `<VPS_IP>` | off |
| `www` | A | `<VPS_IP>` | off |
| `media` | A | `<VPS_IP>` | off (only while the `media` piece is on) |
| `errors` | A | `<VPS_IP>` | off (only while the `monitoring` piece is on) |

Do **not** add AAAA records unless the server has a working public IPv6 address: a dead AAAA record makes Let's Encrypt validation fail. With the edge proxy Off, point the records at your own proxy instead.

**Verify (on your computer):** `dig +short <domain> @1.1.1.1` prints exactly `<VPS_IP>` (and the same for `www` and the other hostnames you use). Public resolvers can lag by a few minutes; the check script asks Google and Cloudflare.

## 8. Run the verification scripts

From the repository on **your computer**:

```bash
VPS_IP=<VPS_IP> SSH_TARGET=<alias> ADMIN_USER=<admin-user> DOMAIN=<domain> scripts/ops/check-vps-bootstrap.sh
```

Add `EXTRA_HOSTS="media.<domain> errors.<domain>"` for the pieces that use them. Every line should be `PASS`. A `WARN` explains itself, and a `FAIL` names the step above to revisit. A coding agent can run this script too: it only needs your SSH key, which your SSH agent unlocks for it.

Then measure what the VPS can reach (the script runs on the VPS without being copied there, and needs no sudo):

```bash
ssh <alias> 'bash -s' < scripts/ops/vps-probe.sh
```

Anything marked `UNREACHABLE` or `BLOCKED?` for the registry, GitHub or the certificate authority needs a fix (a mirror, another route) before the first deploy.

## 9. Docker, `just` and the registry login (as the admin user)

1. Install Docker Engine with the Compose plugin from Docker's apt repository (`https://docs.docker.com/engine/install/ubuntu/`), then configure `live-restore` as in the runbook, section 1.
2. Install `just` 1.43.0 or newer as a release binary, verifying its published checksum, and make sure `flock` (util-linux), `curl` and `jq` are present. The host needs no Node.js.
3. Add the deploy account to the Docker group: `sudo usermod -aG docker deploy`.
4. If the image packages are private, create a GitHub token with `read:packages` only and log the deploy account in (type the token at the prompt; never put it on the command line):

   ```bash
   sudo -u deploy -H docker login ghcr.io -u <github-user> --password-stdin
   ```

**Verify:** `docker compose version` and `just --version` print versions; `sudo -u deploy docker pull ghcr.io/<owner>/<repo>/tools:<a released sha>` succeeds.

Then create `/srv/nuxt-admin-starter/shared/.env` as the runbook describes (sections 3 to 5) and run the first deploy by hand before enabling the timer.

## 10. Sign-in SMS: Kavenegar templates, API key and IP allowlist (before the first production start)

Production sends sign-in codes through Kavenegar `verify/lookup` templates. The app refuses to start in production with the provider on `kavenegar` and no key or Persian template name. Do this in the Kavenegar panel (you), then fill `.env` (you). Skip this step only while the owner opt-in for the mock adapter is set (nobody can then sign in).

1. **Enable the advanced (verification) service** on your Kavenegar account and finish its demo stage. Templates only work on an account that is past the demo stage.

   **Verify:** in the panel, creating a verification template is allowed (no "demo" or "not activated" notice).

2. **Create the two templates** under the verification service. The name has English letters only (no spaces or `_`), and `%token` is Kavenegar's placeholder for the code the app sends. Each template waits for Kavenegar's approval. The English template is optional: an empty English slot sends the code with the Persian template.

   | `.env` variable | Suggested name | Text |
   | --- | --- | --- |
   | `NUXT_SMS_TEMPLATE_OTP_FA` | `<project>OtpFa` | کد ورود شما: %token |
   | `NUXT_SMS_TEMPLATE_OTP_EN` | `<project>OtpEn` | Your sign-in code: %token |

   **Verify:** the panel lists both names with the status approved, and `grep -c '^NUXT_SMS_TEMPLATE_OTP_FA=.' /srv/nuxt-admin-starter/shared/.env` prints `1`.

3. **Put the API key and provider in `.env`** (on the VPS, `/srv/nuxt-admin-starter/shared/.env`): `NUXT_SMS_PROVIDER=kavenegar`, `NUXT_KAVENEGAR_API_KEY=<key from the panel>`, and optionally `NUXT_KAVENEGAR_TIMEOUT_MS` (1000 to 60000, default 10000). Never paste the key into chat, an issue or a command line that is logged.

   **Verify:** `grep -c '^NUXT_KAVENEGAR_API_KEY=.' /srv/nuxt-admin-starter/shared/.env` prints `1`, and `grep '^NUXT_SMS_PROVIDER=' /srv/nuxt-admin-starter/shared/.env` prints `NUXT_SMS_PROVIDER=kavenegar`.

4. **Allowlist only the VPS address.** In the Kavenegar panel's security settings for API access, allow only `<VPS_IP>` and no other address.

5. **Smoke test (once, after the first deploy).** Sign in with your own phone number in both languages and confirm each code arrives. Until this passes, treat SMS as unverified.

---

## 11. Automatic deployment (LAST step, after Docker, `.env`, tokens and DNS)

Do this only when the first manual path works: Docker and `just` installed, `deploy` in the `docker` group and logged in to GHCR (`/srv/nuxt-admin-starter/.docker/config.json`), `/srv/nuxt-admin-starter/shared/.env` complete with `DEPLOY_STATE_DIR=/srv/nuxt-admin-starter/shared/.deploy` and a first manual `just deploy` that succeeded, and DNS pointing at the VPS (proxy off). Enabling the timer is the final step; the first release it finds deploys automatically.

1. **GitHub token** (on github.com, as the repository owner): Settings, Developer settings, Fine-grained tokens. Repository access: only this repository. Permissions: Deployments read and write (Metadata read is added automatically). Choose an expiry (the poller and `just release-status` warn within 30 days of it). Paste it into the file below without echoing it, never into chat or a command line:

   ```bash
   sudo install -d -m 750 -o deploy -g deploy /srv/nuxt-admin-starter/shared /srv/nuxt-admin-starter/bin
   sudo -u deploy sh -c 'umask 077; read -rs -p "token: " t; echo; printf "%s\n" "$t" > /srv/nuxt-admin-starter/shared/github-deployments.token'
   ```

   **Verify:** `sudo stat -c '%U:%G %a' /srv/nuxt-admin-starter/shared/github-deployments.token` prints `deploy:deploy 600`.

2. **Install the poller and units** from a released tools image (use the SHA of any released commit; the registry login from step 9 must work):

   ```bash
   SHA=<full commit sha>
   IMG=ghcr.io/<owner>/<repo>/tools:$SHA
   sudo -u deploy docker pull "$IMG"
   CID=$(sudo -u deploy docker create "$IMG")
   sudo -u deploy docker cp "$CID:/app/scripts/ops/autodeploy.sh" /srv/nuxt-admin-starter/bin/autodeploy
   sudo -u deploy docker cp "$CID:/app/ops/systemd" /tmp/nuxt-admin-starter-systemd
   sudo -u deploy docker rm "$CID"
   sudo chmod 755 /srv/nuxt-admin-starter/bin/autodeploy
   sudo install -m 644 /tmp/nuxt-admin-starter-systemd/nuxt-admin-starter-autodeploy.service /tmp/nuxt-admin-starter-systemd/nuxt-admin-starter-autodeploy.timer /etc/systemd/system/
   rm -rf /tmp/nuxt-admin-starter-systemd
   sudo systemctl daemon-reload
   ```

   **Verify:** `systemd-analyze verify /etc/systemd/system/nuxt-admin-starter-autodeploy.service /etc/systemd/system/nuxt-admin-starter-autodeploy.timer` prints nothing, and `sudo -u deploy /srv/nuxt-admin-starter/bin/autodeploy; echo $?` prints `0` and nothing else when no release is queued (or deploys the queued one, so run it only when you are ready).

3. **Enable the timer (last):**

   ```bash
   sudo systemctl enable --now nuxt-admin-starter-autodeploy.timer
   ```

   **Verify:** `systemctl list-timers nuxt-admin-starter-autodeploy.timer` shows a next run within 2 minutes, and `journalctl -u nuxt-admin-starter-autodeploy --since '10 min ago'` shows only events (or nothing).

Pause automatic deployment at any time with `just autodeploy-pause` (and `just autodeploy-resume`). To stop it completely: `sudo systemctl disable --now nuxt-admin-starter-autodeploy.timer`. Reading the journal and the outcome table are in the runbook, section 7.
