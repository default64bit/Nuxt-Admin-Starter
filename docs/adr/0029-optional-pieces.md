# ADR-0029: Optional pieces: two tiers, Compose profiles as the Off switch, checklists for removal

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

The Starter ships infrastructure and Channels that not every Project needs: media storage, error tracking, Telegram, Web Push, backups, server deploy and the web edge. A Project must be able to stop any of them, or delete them for good, while sign-in, the shell, accounts and roles, audit, Inbox, Dashboard and the test suite keep working. Inventing a different mechanism per piece would make that hard to learn and impossible to test.

## Decision

There are seven **Optional pieces**, each with two tiers:

- **Off:** no code change. The piece stops running and everything else keeps working.
- **Removed:** the piece's code, services, settings and tables are deleted by following its checklist. There is no `just` recipe and no source markers for this (only the demo has them, ADR-0003), because the checklist lists exactly what to delete and a normal drop migration handles tables.

**The Off switch is one list.** `COMPOSE_PROFILES` in `.env` names the infrastructure profiles to run: `media`, `monitoring`, `edge`, `backup`. Recipes, `compose-check`, release guards and `deploy` read it and skip unlisted pieces. Telegram and Web Push have no Compose service; their switches are the `NUXT_ADMIN_CHANNEL_{TELEGRAM,PUSH}_ENABLED` kill switches (ADR-0021). VPS deploy has no profile: it is Off when the host timer is not installed. Application code treats missing configuration as "not configured", never a boot failure.

| Piece | Switch | When Off | Removal checklist |
| --- | --- | --- | --- |
| RustFS + media | profile `media` | Boots without storage config; readiness skips storage; upload and variant routes answer "not configured"; the image field is disabled with a hint; thumbnails fall back to a placeholder | [media](../optional-pieces/media.md) |
| GlitchTip | profile `monitoring` | No CSP report endpoint; empty DSN means error capture is not configured; release guards drop the errors domain; the edge serves no errors host | [GlitchTip](../optional-pieces/glitchtip.md) |
| Telegram | kill switch | Channel reads "not configured"; no bot polling | [Telegram](../optional-pieces/telegram.md) |
| Web Push + PWA | kill switch | Channel reads "not configured"; no push sends | [Web Push + PWA](../optional-pieces/web-push-pwa.md) |
| Backups | profile `backup` | No job and no deploy step | [Backups](../optional-pieces/backups.md) |
| VPS deploy | host timer | Timer not installed; CI still builds release images | [VPS deploy](../optional-pieces/vps-deploy.md) |
| Caddy | profile `edge` | The Project brings its own proxy; the app port is published; ACME and domain guards are skipped | [Caddy](../optional-pieces/caddy.md) |

**Defaults in a fresh Project:** every profile listed except `monitoring` locally; Telegram and Web Push read "not configured" until keys are set. First-run setup offers to drop pieces from the list and writes the choice into the committed environment examples.

**Each checklist** has an Off section and a Removed section. The Removed section lists files, Compose services, environment keys, dependencies, tables, CI jobs, tests and fixtures, and the drop migration where tables exist. The Telegram and Web Push checklists cover removing the Channel; the media checklist lists the demo image touch-points.

**Proof.** The `all-off` CI job boots with empty `COMPOSE_PROFILES` and no Channel keys, then runs smoke and readiness checks (ADR-0020). An Off piece's tests still run, against fakes (ADR-0017).

## Alternatives considered

- A separate env flag per piece: seven mechanisms to learn, test and keep in sync.
- Removal recipes and source markers per piece: a script to maintain for every piece, for something done once.
- A runtime feature-flag framework: far more machinery than a Compose profile list.

## Consequences

- Positive: one way to turn infrastructure off, a CI job proving it, and an exact checklist for deleting a piece for good.
- Negative / trade-offs: the checklists are hand-maintained and can drift from the code; the `all-off` job guards the Off tier, not the Removed one.
- Follow-ups: when a new Optional piece is added, add its profile or kill switch, its checklist and a row in this table.
