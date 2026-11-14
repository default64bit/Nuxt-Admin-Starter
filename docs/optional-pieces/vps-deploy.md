# VPS deploy (pull-based deployment)

Optional piece, ADR [0020](../adr/0020-ci-cd-and-deployment.md) and [0029](../adr/0029-optional-pieces.md). CI builds one image pair per commit and queues a `production` GitHub Deployment. A systemd timer on the VPS polls GitHub, extracts the release's deploy files from its tools image and runs `just deploy <sha>`: guards, host lock, pull and verify, one-shot jobs (migrations, seeds, media storage init), switch, health, smoke check, state record and automatic revert on failure. GitHub holds no credential to the VPS. `just rollback`, `just release-status` and `just prune-images` are the manual recipes. How to run it: [VPS runbook](../architecture/vps-runbook.md) and [bootstrap checklist](../architecture/vps-bootstrap-checklist.md).

The piece has no Compose profile. It reads the one list, `COMPOSE_PROFILES`, and skips every piece that is not listed: the edge guards and the Caddy switch (`edge`), storage initialization (`media`), the backup report (`backup`) and the best-effort GlitchTip start (`monitoring`).

## Off

No code change. The piece is Off when the host timer is not installed.

1. Do not install the timer (runbook section 7), or stop an installed one: `sudo systemctl disable --now nuxt-admin-starter-autodeploy.timer`. Delete the GitHub token file and revoke the token in GitHub.
2. Release images are still built by CI and pushed to GHCR, and the release workflow still queues a `production` Deployment that nothing polls. That is harmless.
3. Deploy by hand with `just deploy <sha>` on the host, or with your own tooling: pull `ghcr.io/<owner>/<repo>/{app,tools}:<sha>`, run the `migrate` and `seed` jobs of the tools image, then `docker compose up -d`. The recipes keep working without the timer. `just release-status` reports that automatic deployment is not installed.

## Removed

Do Off first, then delete:

- **Files:** `scripts/ops/release-lib.sh`, `scripts/ops/autodeploy.sh`, `scripts/ops/autodeploy-status.sh`, `scripts/ops/check-vps-bootstrap.sh`, `scripts/ops/vps-probe.sh`, `ops/systemd/` (the autodeploy service and timer, and `mss-clamp.service`), `deploy/production.env.example`, `docs/architecture/vps-runbook.md`, `docs/architecture/vps-bootstrap-checklist.md`, and this file.
- **justfile:** `predeploy-check`, `deploy`, `rollback`, `release-status`, `autodeploy-pause`, `autodeploy-resume`, `prune-images` and `test-deploy-dry-run`. Keep `smoke`, `edge-guards` and `cert-status`: the edge piece and the `all-off` CI job use them.
- **Release workflow:** the `deploy` job of `.github/workflows/release-images.yml` (the queued Deployment) with its `deployments: write` permission and the `starter-meta` block of `STARTER_SKIP_DEPLOYMENT`, and the matching header comment. Image building stays.
- **Environment keys:** `DEPLOY_STATE_DIR` from `.env.example`; in the server's `.env` also `DEPLOY_APPROVED` if you set it. `APP_IMAGE_REPO` stays: the production Compose overlay uses it.
- **Compose:** nothing. The deploy added no service. `compose.prod.yaml` stays as the production overlay.
- **Tests and fixtures:** `tests/infra/deploy-dry-run.test.ts`, `tests/infra/autodeploy.test.ts`, `tests/fixtures/deploy-stub/`, `tests/unit/ops/production-env-template.test.ts`, and the Deployment-job cases in `tests/unit/ops/release-workflow.test.ts`.
- **CI:** nothing to change; the `deploy-automation` job runs whatever is left in `tests/infra`.
- **Host:** the installed units and poller (`sudo systemctl disable --now nuxt-admin-starter-autodeploy.timer`, then delete the files from `/etc/systemd/system/` and `<root>/bin/autodeploy`), the `mss-clamp` unit if you enabled it, and the `deploy` service account if nothing else uses it.
- **Dependencies and tables:** none. No drop migration.
- **Docs:** the VPS deploy row of ADR 0029 and the release and deployment paragraphs of ADR 0020 (record the removal as a superseding note), the production-release paragraph of `docs/architecture/local-development-deployment.md`, and the mentions in `README.md`.
