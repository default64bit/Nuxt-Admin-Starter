# VPS runbook: first-time bootstrap and operations

Audience: the operator of the single production VPS. Design background: ADR-0020, ADR-0029 and `local-development-deployment.md`. Images are built by CI and pulled from GHCR; nothing is built on the server. The deploy is an Optional piece (`docs/optional-pieces/vps-deploy.md`); this runbook assumes it is on. For the host's setup state, follow `vps-bootstrap-checklist.md`.

Paths below use `/srv/nuxt-admin-starter` as the deploy account's home (the repository slug; your Project renames it at first run). `COMPOSE_PROFILES` in the server's `.env` decides which Optional pieces run (`media`, `monitoring`, `edge`, `backup`); the deploy and the release guards skip every piece that is not listed.

## 0. GitHub setup (once, before the first release)

1. Push `main` through a develop-to-main pull request. The `CI` workflow runs on pull requests; `Release images` runs CI again on every push to `main`, then pushes `ghcr.io/<owner>/<repo>/{app,tools}:<full-sha>` and queues a `production` Deployment for the SHA. Watch the first run end to end.
2. Settings, Actions, General: allow GitHub Actions to run. The release job requests `packages: write` and `deployments: write` itself, so no repository-wide write default is needed (if your account or organization restricts workflow permissions, allow it for this repository).
3. Settings, Branches (or Rulesets): protect `main` and require every CI job (`checks`, `integration`, `deploy-automation`, `security`, `e2e`, `all-off`) to pass before merging.
4. After the first successful `Release images` run, open the repository's Packages, link the `app` and `tools` packages to the repository, and decide visibility (private packages need the read token in section 4).
5. Release: merge to `main`, wait for `Release images`. With the timer installed (section 7) the host deploys the queued release by itself; otherwise copy the full commit SHA from the run and deploy it by hand (section 5). A `vX.Y.Z` tag adds a human-readable alias to the same images.

## 1. Host prerequisites

- Linux VPS with a public IPv4 address. The checklist assumes Ubuntu 24.04 LTS.
- Docker Engine with the Compose plugin (`docker compose version` works), configured as below.
- `just` 1.43.0 or newer (a checksum-verified release binary), `flock` (util-linux), `curl`, `jq`, `git`.
- No Node.js on the host. The smoke check needs only `curl`; migrations and seeds run in the `tools` image (`docker compose run --rm`).
- Firewall: allow SSH, TCP 80, TCP 443 and UDP 443 only (80 and 443 are needed by the edge proxy and its certificate challenges). PostgreSQL, object storage and the GlitchTip port are bound to loopback and must never be opened. With the edge proxy Off, publish only what your own proxy needs.

### Docker daemon configuration (`/etc/docker/daemon.json`)

Enable `live-restore` so containers keep running while the Docker daemon restarts or is upgraded:

```json
{
  "live-restore": true
}
```

Apply it with `sudo systemctl restart docker`, then check `docker info` for `Live Restore Enabled: true`. Production pulls only from `ghcr.io/<owner>/<repo>/...` (the release images and the `base/<name>` copies of PostgreSQL, Caddy and the other base images, pinned by digest). If your network cannot reach a registry directly, add `"registry-mirrors": ["https://<mirror-host>"]` for anything else the host pulls.

### TCP MSS clamp (`ops/systemd/mss-clamp.service`, optional, not installed)

The unit ships with the VPS deploy piece and is **not** installed by default. Enable it only when you see this symptom: HTTPS handshakes time out from some networks (typically clients far away or behind VPNs) while plain HTTP and small requests work, or large container downloads stall. The cause is an uplink MTU below the 1500 of the Docker bridges: containers, the edge proxy included, then advertise a TCP MSS that is too large, full-size packets are dropped upstream and the "fragmentation needed" reply never reaches the client.

Confirm the cause before installing: `ip -o link show` (or `ip route get 1.1.1.1`) shows the uplink's `mtu`; if it is lower than 1500, test with `ping -M do -s 1372 <public host>` (MTU minus 28) and reduce the size until it succeeds. Then clamp the MSS of forwarded connections to the path MTU:

```bash
sudo install -m 644 ops/systemd/mss-clamp.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now mss-clamp.service
```

Check with `sudo iptables -t mangle -S FORWARD`: it lists `-j TCPMSS --clamp-mss-to-pmtu`. Test the site from a remote network afterwards. `just release-status` warns while an installed copy differs from the release's file. To remove it: `sudo systemctl disable --now mss-clamp.service` and delete the unit file.

## 2. DNS and certificates

Point `SITE_DOMAIN` (and `www.<SITE_DOMAIN>`, plus `MEDIA_DOMAIN` while `media` is listed and `ERRORS_DOMAIN` while `monitoring` is listed) at the VPS before the first deploy, each with any CDN or DNS proxy **off**: the edge proxy obtains certificates with HTTP-01/TLS-ALPN-01, which a proxy would intercept. With `edge` Off, point DNS at your own proxy instead and skip the rest of this section.

Caddy runs the stock image, pinned by digest in `ops/caddy/base-images.txt` and mirrored to GHCR `base/caddy`. Let's Encrypt is the issuer. The CA's validation servers must reach ports 80 and 443.

1. Check that each hostname resolves to the VPS IP (`scripts/ops/check-vps-bootstrap.sh`).
2. First issuance against Let's Encrypt staging: set `CADDY_ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` in `.env`, deploy, and check `docker compose logs caddy` for a successful issuance. Then remove `CADDY_ACME_CA` and deploy again; Caddy requests the real certificates. `just release-status` warns while the override is set.
3. Renewal is automatic and starts well before expiry. `just release-status` prints each hostname's certificate expiry, read through a loopback handshake with SNI, and warns under 14 days. Certificate state lives in the `caddy-data` and `caddy-config` volumes, so do not delete those volumes.

## 3. Checkout and configuration

1. Clone the repository on the server and check out the commit or tag you will deploy (the checkout supplies the justfile, Compose files, Caddyfile and scripts; the application itself comes from the registry image).
2. Create `/srv/nuxt-admin-starter/shared/.env` from the committed, placeholder-only template `deploy/production.env.example` (`cp deploy/production.env.example /srv/nuxt-admin-starter/shared/.env && chmod 600 /srv/nuxt-admin-starter/shared/.env`), then replace every placeholder with a production value. The template's comments say where each value comes from; it lists every variable the production Compose stack and the production guards need (a unit test enforces the Compose part). Never commit the real file; `DEPLOY_APPROVED` is passed per deploy, not stored in it.
3. Set `COMPOSE_PROFILES` to the pieces this server runs. A piece that is not listed needs none of its settings and none of its guards.
4. Production refuses placeholder values, and a sign-in SMS provider that is disabled or mock unless the owner opt-in is set. A real launch needs `NUXT_SMS_PROVIDER=kavenegar` with its key and templates (checklist section 10).

## 4. Registry access

CI publishes `ghcr.io/<owner>/<repo>/app:<sha>` and `.../tools:<sha>` (owner path in lowercase), and copies the pinned base images unchanged (same digest) to `ghcr.io/<owner>/<repo>/base/<name>:<tag>`. If the packages are private, create a token with `read:packages` only and run `docker login ghcr.io` as the `deploy` account on the server. Use a read-only credential; CI uses its own write token. `APP_IMAGE_REPO` in `.env` overrides the repository path.

## 5. First deploy

Find the full 40-character commit SHA of a commit whose CI run and image publishing succeeded, then, in the checkout:

```bash
NUXT_APP_ENV=production DEPLOY_APPROVED=YES just deploy <full-commit-sha>
```

The command is fail-fast and names the failing step. On a first deploy there is no previous release, so a failure after the switch cannot be auto-reverted and the command says so.

What `just deploy` does, in order:

1. **Guards.** A full lowercase SHA, `NUXT_APP_ENV=production`, `DEPLOY_APPROVED=YES`, a real `https://` `NUXT_PUBLIC_SITE_URL`, and, with `edge` listed, `scripts/ops/edge-guards.sh` (real `SITE_DOMAIN` and `ACME_EMAIL`, the public URL in step, and the media or errors domain only while those pieces are listed).
2. **Lock.** Deploys and rollbacks never run concurrently.
3. **Pull and verify** the release images (`app`, the `tools` image behind the jobs, and Caddy when `edge` is listed).
4. **Backup report** (only while `backup` is listed and the recipe exists): advisory, never blocks.
5. **Jobs, before anything is switched:** `migrate`, `seed`, and the media storage initialization while `media` is listed. A failure here aborts with the old release still serving.
6. **Switch** the application (and Caddy while `edge` is listed) to the new tag and wait for container health. GlitchTip is started best effort while `monitoring` is listed.
7. **Smoke check** on the app's loopback port: liveness, readiness, the landing page and the sign-in page (`scripts/ops/smoke-check.sh`).
8. **Record** the release in `release.env` (current and previous SHA). If steps 6 or 7 fail, the application is reverted to the previous release and re-verified; the command still exits non-zero and says whether the revert worked.

After the first deploy:

1. Confirm `/api/health/ready` answers 200 and the site opens over HTTPS.
2. The Default admin is created by the seed from `DEFAULT_ADMIN_PHONE` (and optional `DEFAULT_ADMIN_GIVEN_NAME` and `DEFAULT_ADMIN_FAMILY_NAME`) in `.env`. If the phone was blank during the first deploy, set it and deploy again (or `docker compose run --rm seed`); the seed creates the admin once and never changes it afterwards.
3. With `monitoring` listed, complete the one-time GlitchTip bootstrap (admin, project, DSNs) and keep registration disabled.

## 6. Everyday operations

| Task | Command |
| --- | --- |
| Deploy a release | `NUXT_APP_ENV=production DEPLOY_APPROVED=YES just deploy <sha>` |
| Revert to an earlier release (no migrations) | `NUXT_APP_ENV=production DEPLOY_APPROVED=YES just rollback <sha>` |
| Current and previous release, health, certificates, warnings | `just release-status` |
| Free disk (keeps current and previous release images and `releases/<sha>/` directories) | `just prune-images` |
| Stop or allow automatic deployment | `just autodeploy-pause` / `just autodeploy-resume` |
| Logs | `just logs app` |

Deploys and rollbacks take a lock and refuse to run concurrently. If a deploy fails after the switch the command restores the previous release automatically and exits non-zero; read its output for `Reverted to previous release` or `REVERT FAILED`. Database changes are never rolled back, which is why schema changes must follow expand/contract (ADR-0007). Rollback switches only the application: it leaves the edge proxy as it is.

Every `just deploy` writes `last-result.env` (`SHA`, `OUTCOME`, `STEP`) in the state directory (`DEPLOY_STATE_DIR`, production `/srv/nuxt-admin-starter/shared/.deploy`), next to `release.env`; automation reads that file instead of parsing output. The automatic revert runs from `releases/<previous-sha>/` when that directory sits beside the current release directory, so it uses the previous release's own Compose file. `just rollback` adds the SHA it leaves to `attempted-shas` so the poller never redeploys it.

When a release adds a service that runs the app or tools image (a background worker, say), add it to `revert_services` in `scripts/ops/release-lib.sh`, so that it is switched, verified and reverted with the application.

## 7. Automatic deployment

Merging to `main` queues a GitHub Deployment; a systemd timer on the VPS deploys the newest one and reports the result back. GitHub never holds a credential to the VPS. Manual `just deploy` and `just rollback` never call GitHub and need no token. The Starter repository itself queues no Deployment (a marked condition in the release workflow, removed by first-run).

**Install (once, after `.env`, the registry login, the GitHub token and DNS are in place; the timer is the last step).** The checklist `vps-bootstrap-checklist.md`, section 11, has the exact commands. In short:

1. Put `DEPLOY_STATE_DIR=/srv/nuxt-admin-starter/shared/.deploy` in `/srv/nuxt-admin-starter/shared/.env`.
2. Create the fine-grained token (this repository only; Deployments read and write, plus the mandatory Metadata read) and store it in `/srv/nuxt-admin-starter/shared/github-deployments.token`, mode 600, owner `deploy`. It is read from that file only: never in `.env`, never on a command line, never in the journal.
3. Install the poller as `/srv/nuxt-admin-starter/bin/autodeploy` (owner `deploy`) and the two unit files from `ops/systemd/` into `/etc/systemd/system/` with sudo, then `sudo systemctl daemon-reload`. All three come from a release's tools image (`/app/scripts/ops/autodeploy.sh`, `/app/ops/systemd/`).
4. `sudo systemctl enable --now nuxt-admin-starter-autodeploy.timer`.

After that each successful automatic deploy replaces `bin/autodeploy` with the new release's copy. The unit files are only changed by you: when a release changes them, `just release-status` prints `WARNING: installed ... differs` with the install command.

The poller derives the GitHub repository from the image path (`APP_IMAGE_REPO` without its registry host), so a Project needs no extra setting beyond that path.

**What a tick does.** Every 2 minutes (`OnBootSec=2min`, `OnUnitActiveSec=2min`): retry posting a report GitHub has not accepted yet; stop if paused; take the newest `production` Deployment created by `github-actions[bot]` whose latest status is `queued` and whose SHA is not in `attempted-shas`; mark older queued ones `inactive`; pull `tools:<sha>`, extract the deploy bundle to `releases/<sha>/`; post `in_progress`; run `NUXT_APP_ENV=production DEPLOY_APPROVED=YES just deploy <sha>` there; read `last-result.env`; record the outcome, then post it. On success the `current` symlink moves, `bin/autodeploy` is refreshed and `just prune-images` runs.

| `last-result.env` outcome | Deployment status | Retried? |
| --- | --- | --- |
| `success` | `success`, `environment_url` the public site URL | n/a |
| `aborted-before-switch` at `lock`, `pull-images`, `verify-images`, `backup-status` | back to `queued` ("delayed at <step>; will retry") | yes, next tick |
| `aborted-before-switch` at `migrate`, `seed`, `storage-init` | `failure` ("<step> failed; previous release still serving") | never (SHA added to `attempted-shas`) |
| `reverted` | `failure` ("smoke check failed; reverted to <short sha>") | never |
| `revert-failed` | `failure` ("REVERT FAILED, site may be down") | never |
| `revert-impossible` | `failure` ("failed, no previous release") | never |
| `guard` | `error` ("host configuration invalid: <message>"); fix `.env`, then deploy by hand or ship a new release | not marked attempted |

A failed GitHub, pull or extraction step before `just deploy` starts leaves the Deployment `queued` and is retried on the next tick. If posting the result fails, the report is kept in `pending-report.json` and posted again on the next tick **before anything else**, without redeploying. `just release-status` shows an unposted report.

**Pause and resume (incident switch).** `just autodeploy-pause` creates `autodeploy.paused`; ticks then deploy nothing (the journal says "paused" once). `just autodeploy-resume` removes it. Pausing does not stop a deploy that is already running.

**Reading the journal.** Everything is in journald under `nuxt-admin-starter-autodeploy`; a tick with nothing new logs nothing.

```bash
journalctl -u nuxt-admin-starter-autodeploy --since today   # events: candidate, superseded, transient, deploy started/finished, report posted/pending
journalctl -u nuxt-admin-starter-autodeploy -f              # follow a running deploy (includes the full `just deploy` output)
systemctl list-timers nuxt-admin-starter-autodeploy.timer   # next and last tick
systemctl status nuxt-admin-starter-autodeploy.service
```

Lines starting `WARNING` come from the daily checks (once per UTC day): a certificate with under 14 days left and the GitHub token expiring within 30 days (from GitHub's `github-authentication-token-expiration` response header; renew the token and overwrite the token file, no restart needed). A rejected token (HTTP 401) fails the unit. The log never contains the token, `.env` values or personal data.

To retry a SHA the poller gave up on, fix the cause, remove its line from `/srv/nuxt-admin-starter/shared/.deploy/attempted-shas` and queue a new Deployment status `queued` for it (or just ship a new release).

## 8. What the tests prove, and what only a real server can

`just test-deploy-dry-run` runs `just deploy`, `rollback`, `release-status` and `prune-images` against stub images in a throwaway Compose project, and the poller against a stub GitHub API, stub `just` and stub `docker`. The release guards are covered by the edge-guards tests, and the `all-off` CI job boots the app with every piece Off and runs the smoke check.

These can only be proven on the real server, so check them on the first release: Let's Encrypt issuance and renewal and the Caddy routing; firewall exposure (only 22, 80 and 443 reachable); pulling from GHCR with the read token; the first Deployment queued by the release workflow, the timer's first tick and the status it posts; and, if you use them, GlitchTip initialization and the off-host backup destination.
