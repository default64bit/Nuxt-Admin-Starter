# ADR-0007: Migration workflow

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

`drizzle-kit push` is fast but applies changes without a reviewable history. Production needs auditable, repeatable migrations.

## Decision

- `just` is the supported entry point for repeated developer, database, pre-deploy and release operations. Package scripts remain the underlying portable operations; the `justfile` sequences them and performs readiness checks.
- **Fresh baseline.** The schema starts from one baseline migration. It also re-creates the hand-written triggers (the append-only audit log and the Super role protection), because Drizzle cannot generate them. The demo ticket tables live in their own migration after the baseline, so removing the demo removes one migration (see the demo removal recipe).
- `just db-prepare` is idempotent: ensure the target database exists, apply only committed pending migrations, run versioned seeds that have not yet run, then prepare Nuxt types and typecheck.
- Seeds are versioned and recorded. The production seed creates only the `super` Role, then the Default admin from environment configuration. The Permission reconcile is add-only and grants every key to `super`; removing a key is a hand-written migration. A completed seed version is not reapplied because someone later edits what it created. Development seed data (a few dev Users holding `super`) runs in dev and test only, lives in `server/database/seed.ts`, and never in migrations (except required reference data).
- The workflow MUST NOT silently generate a migration and apply it. Schema changes first create a reviewable migration with `just db-generate <name>`; a reviewer inspects and commits it. `just db-migrate` applies committed pending migrations only.
- `drizzle-kit push` is limited to disposable local prototyping (`just db-push-local`) and MUST NOT be used by pre-deploy or production commands.
- Anything that merges has a SQL migration in `server/database/migrations/`, reviewed like code. Never edit a migration that has run in a shared environment.
- Migrations are applied as an explicit release step before the new app version receives traffic. The app does not auto-migrate on boot.
- Destructive changes use expand/contract: add the new column, backfill, switch code, drop the old column in a later release. Migrations stay backward compatible with the previous app version.
- CI runs migrations against a fresh Postgres to prove they apply cleanly.

## Consequences

- Positive: auditable history, safe deploys, rollback paths.
- Negative: slower than `push`, and developers must resolve migration conflicts on merge.
