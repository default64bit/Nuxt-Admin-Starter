# Backups: Off and Removed

Optional piece, ADR [0020](../adr/0020-ci-cd-and-deployment.md) and [0029](../adr/0029-optional-pieces.md). With the `backup` profile on, the `backup` service runs `pg_dump -Fc` of the application database every night (03:30 UTC by default) and uploads it to an S3-compatible bucket on another host, keeping 14 days of dumps. **The database only: uploaded media is not backed up in v0** (no media backup, no point-in-time recovery). The operator view, with the restore drill, is in [Monitoring, backups and TLS](../architecture/monitoring-backups-tls.md).

How it is built: the `backup` stage of the `Dockerfile` is the digest-pinned PostgreSQL image of `compose.yaml` (so `pg_dump` matches the server) plus `curl`, which signs the S3 requests itself (AWS Signature V4, path-style). The job is `scripts/backup/backup.sh`; the recipes `backup-now`, `backup-status`, `backup-list` and `backup-restore` run it once through `scripts/ops/backup-run.sh`. CI builds the image for every release (`ghcr.io/<owner>/<repo>/backup:<sha>`), and `just deploy` moves the job to it after the switch, best effort.

A missing or unreachable destination never blocks anything. Without `BACKUP_S3_*` the service logs a warning and idles; boot, CI and `just deploy` do not wait for it, and `just backup-status` and `just release-status` say that no backup exists instead of claiming one does.

## Off (no code change)

1. Remove `backup` from `COMPOSE_PROFILES` in `.env` (`just dev-down` stops a running job).
2. Nothing else changes. With the profile Off there is no `backup` service, `just deploy` skips the backup report and the job update, `just release-status` prints no backup line, and the `backup-*` recipes answer "Backups are Off". The dumps already in the bucket stay there; delete them and the credentials at your storage provider if you no longer want them.

## Removed (delete it for good)

Do Off first, then delete the following.

- **Job and image:** `scripts/backup/` (`backup.sh`), `scripts/ops/backup-run.sh`, and the `backup` stage of the `Dockerfile` (the block after `tools`).
- **Compose:** the `backup` service in `compose.yaml`, in `compose.dev.yaml` (the `backup` entry with its `build`) and in `compose.prod.yaml`.
- **Recipes:** `backup-now`, `backup-status`, `backup-list` and `backup-restore` in the `justfile`; the `${repo}/backup` entry of the `prune-images` image list; and `rl_backup_up` and `rl_backup_status` in `scripts/ops/release-lib.sh` with their calls (`rl_backup_up` in `deploy`, `rl_backup_status` in `deploy`, the `backup-status` line in `release-status`). In `scripts/ops/autodeploy.sh` drop `backup-status` from `TRANSIENT_STEPS`.
- **Checks:** in `scripts/ops/compose-check.mjs` the `backup` entries of `PIECE_PROFILES` and `PIECE_SERVICES`, `BACKUP_BASE`, `compareBackupBase` and its call, and the `-backup` part of the dev image comment on `DEV_IMAGE`.
- **Release workflow:** in `.github/workflows/release-images.yml` the `backup=` line of "Resolve image names", the `backup` inspect in "Check whether the SHA images already exist", the two "Build and push backup image" steps and `"${{ steps.names.outputs.backup }}"` in the version-tag alias loop. Update `tests/unit/ops/release-workflow.test.ts` to match (six `cache-to` lines become four, and `backup` leaves the target list and the alias loop).
- **Environment:** the `BACKUP_S3_*`, `BACKUP_AT`, `BACKUP_RETENTION_DAYS` and `BACKUP_MAX_AGE_HOURS` keys in `.env.example` and `deploy/production.env.example`, and `backup` in the `COMPOSE_PROFILES` comments and defaults (`.env.example`, `deploy/production.env.example`, `tests/fixtures/compose-check.env`, the examples in `tests/infra/*.test.ts`).
- **Tests:** `tests/infra/backups.test.ts`.
- **Dependencies and tables:** none. No drop migration.
- **CI:** nothing to change; the `deploy-automation` job runs whatever is left in `tests/infra`.
- **Documentation:** the Backups row of ADR 0029 and the backups bullet of ADR 0020 (record the removal as a superseding note), the backup mentions in `docs/architecture/local-development-deployment.md`, `docs/architecture/vps-runbook.md` and `docs/optional-pieces/vps-deploy.md`, the backups section of `docs/architecture/monitoring-backups-tls.md`, `README.md`, and this file.
- **Bucket:** delete the dumps and revoke the access key at your storage provider.
