# ADR-0006: PostgreSQL with Drizzle ORM

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

The app needs a relational, transactional store and a type-safe data access layer that works well with Nitro and stays close to SQL.

## Decision

- Database: PostgreSQL, one current supported major version used locally, in CI and in production.
- Access: Drizzle ORM with the `node-postgres` (`pg`) driver and a connection pool created once per process.
- Schema lives in `server/database/schema/`, one file per feature, re-exported from `schema/index.ts`.
- Conventions: `snake_case` in the database and `camelCase` in code (Drizzle's casing option); `uuid` or identity primary keys chosen per table and documented; `created_at` and `updated_at` as `timestamptz`; foreign keys and indexes declared explicitly. Columns that filter or sort a list are indexed.
- Version policy: the Starter pins the Drizzle 0.x line, with `drizzle-orm` and `drizzle-kit` pinned to compatible versions together. Drizzle v1 introduces Relational Queries v2 (`defineRelations`) and a new migrations folder format, so moving to it is a deliberate upgrade, not a drive-by bump.
- No raw SQL in services. Raw SQL is allowed in repositories with a comment when Drizzle cannot express it.
- Database triggers are allowed for invariants that must hold regardless of the caller (the Super role protection and the append-only audit log). Drizzle does not generate them, so they are written by hand in a migration.

## Alternatives considered

- Prisma: strong DX, but a heavier engine and generation step and less SQL-transparent.
- Kysely or raw SQL: more manual typing and schema management.

## Consequences

- Positive: SQL-like queries, inferred types, a lightweight runtime.
- Negative: the ORM is still moving toward 1.0, and migration tooling needs discipline (ADR-0007).
