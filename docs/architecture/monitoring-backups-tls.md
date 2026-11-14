# Monitoring, backups and TLS

What an operator needs to watch, restore and renew on the production stack. Each part belongs to an Optional piece (ADR [0029](../adr/0029-optional-pieces.md)) and is read only while its profile is listed in `COMPOSE_PROFILES`; a piece that is Off needs none of the settings below. Setup of the host is in the [VPS bootstrap checklist](vps-bootstrap-checklist.md) and daily commands in the [VPS runbook](vps-runbook.md).

`just release-status` is the one place that gathers the signals: container health, certificate expiry, the age of the newest backup and whether GlitchTip is running.

## Monitoring (profile `monitoring`)

GlitchTip is the self-hosted, Sentry-compatible error tracker. The app sends server and browser errors to it when a DSN is set, and nothing when it is not. GlitchTip runs in its own database and role on the shared PostgreSQL, so it is part of the backup only if you add that database to it (see below). It is started best effort by `just deploy`: if it cannot start, the release is not blocked or reverted, and `just release-status` warns that error tracking is unavailable.

- First setup (admin, project, DSNs), ports and keys: [Local development and deployment](local-development-deployment.md) and the [GlitchTip checklist](../optional-pieces/glitchtip.md).
- Watch: `just logs glitchtip`, and the project page in the GlitchTip UI. Event retention is `GLITCHTIP_EVENT_RETENTION_DAYS`.

## Backups (profile `backup`)

The `backup` service dumps the application database with `pg_dump -Fc` every night at `BACKUP_AT` (UTC, default 03:30) and uploads it to the bucket named by `BACKUP_S3_*`, under `<BACKUP_S3_PREFIX>/<database>-<UTC timestamp>.dump`. After each successful upload, dumps older than `BACKUP_RETENTION_DAYS` (14) are deleted; the newest dump is never deleted. Details and removal: [Backups checklist](../optional-pieces/backups.md).

**What is and is not backed up.** The application database only. **Uploaded media is not backed up in v0**: the media bucket on the storage service is the only copy, so give that bucket its own replication or copy job if the files matter. There is no point-in-time recovery; you can lose up to a day of data. GlitchTip's database is not in the dump either (it is a separate database and the events are disposable).

**Choose the destination.** Any S3-compatible service on another host or provider than the VPS (a dump next to the data it protects is not a backup). Create a bucket used for nothing else and an access key limited to it that can list, read, write and delete objects; put `BACKUP_S3_ENDPOINT` (for example `https://s3.example.org`, path-style), `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY` and optionally `BACKUP_S3_REGION` in the server's `.env`. A bucket lifecycle rule that expires objects after 30 days is a sensible second line of defence.

**A missing destination never blocks anything.** With the keys empty the service logs a warning and idles; CI, boot and `just deploy` do not depend on it. Nothing claims off-host protection exists until a dump is in the bucket.

### Check that it works

| Command | What it does |
| --- | --- |
| `just backup-status` | The last-success check. Reads the bucket and prints the newest dump and its age. Exit 0 healthy; 1 no dump yet, or the newest is older than `BACKUP_MAX_AGE_HOURS` (36); 2 no destination configured; 3 bucket unreachable. `just deploy` and `just release-status` run it and only print the result. |
| `just backup-now` | Dumps and uploads right now, with the same pruning. Use it after configuring the destination, and before risky changes. |
| `just backup-list` | Lists the dumps in the bucket, oldest first. |
| `just logs backup` | The job's own log: one `BACKUP OK <key>` or `BACKUP FAILED` line per run. |

After the first deploy, run `just backup-now` and then `just backup-status`; if the status is not green, nothing is backed up yet.

### Restore drill

Do this once after setting backups up, and again after any change to the destination, and at least once a quarter. A backup that has never been restored is a hope, not a backup. It never touches the live database.

1. `just backup-list` and pick a key (the newest, or the one before the incident).
2. `just backup-restore <key>` restores it into a new scratch database named `restore_<timestamp>`, or into the name you give: `just backup-restore <key> scratch_check`. It refuses an existing database and the live one, and drops the scratch database again if the restore fails.
3. Check the data: `docker compose exec postgres psql -U "$POSTGRES_USER" -d scratch_check` and compare row counts of a few important tables (for example `select count(*) from users;`) and the newest audit event with what the application shows. Keep the time in mind: the dump holds the state as of its timestamp.
4. Drop it: `docker compose exec postgres psql -U "$POSTGRES_USER" -d postgres -c 'DROP DATABASE scratch_check;'`.

**Recovering for real** is the same restore followed by a deliberate swap that you do by hand: stop the app (`docker compose stop app`), restore into a scratch database, verify it, then rename it (`ALTER DATABASE app RENAME TO app_broken; ALTER DATABASE scratch_check RENAME TO app;` as the superuser, with no open connections) and start the app. The restore keeps the original owners and grants while the roles exist in the cluster (the usual case); otherwise it retries without them and the tables belong to the superuser, so create the runtime role first (the stack creates it at the first start of PostgreSQL) and run the restore again. Run `just db-migrate` afterwards: the dump may be older than the deployed release.

## TLS (profile `edge`)

Caddy obtains and renews Let's Encrypt certificates by itself with HTTP-01/TLS-ALPN-01, for the site host and the hosts of the media and error-tracking pieces that are listed. Renewal starts well before expiry and needs no action. What can go wrong, and what to do:

- **Certificates are not issued.** DNS for each host must point straight at the VPS with any CDN or DNS proxy off, and ports 80 and 443 must be reachable. For the first issuance only, set `CADDY_ACME_CA` to the Let's Encrypt staging directory to avoid rate limits, then remove it. `docker compose logs caddy` shows the ACME errors.
- **Watch expiry.** `just cert-status` (also part of `just release-status`) reads each served certificate through a loopback handshake and warns under 14 days. It warns and never fails.
- **Keep the state.** Certificates and the ACME account live in the `caddy-data` and `caddy-config` volumes; deleting them re-issues everything and can hit rate limits.
- **Stalled handshakes on a bad uplink** (large TLS packets never arrive): the VPS deploy piece ships an off-by-default MSS clamp unit; the runbook says when to enable it.

With `edge` Off the Project's own proxy terminates TLS and none of this applies; see the [Caddy checklist](../optional-pieces/caddy.md).
