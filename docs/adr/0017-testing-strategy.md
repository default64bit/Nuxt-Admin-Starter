# ADR-0017: Testing strategy

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Tests must give confidence in refactors, migrations and permissions without a suite so slow or flaky that people stop running it. Behavior is checked through the highest seam a User or Project sees.

## Decision

- Tooling: Vitest, `@nuxt/test-utils` and Vue Test Utils for unit and component tests, a real PostgreSQL for integration tests, Playwright for end-to-end tests, and `@axe-core/playwright` for accessibility assertions inside the e2e specs.
- Scripts: `pnpm test` runs the default Vitest suite; `test:unit`, `test:integration`, `test:e2e`, `test:e2e:sharded` and `test:a11y` (the `@a11y` subset, for local use) run focused tiers. `just` recipes wrap the same commands.
- CI runs lint, typecheck, unit and component tests, Postgres-backed integration tests, build, dependency and secret checks, the Docker infra tests, and the Playwright suite (ADR-0020).
- Behavior that relies on database constraints, transactions, idempotency or concurrency is tested against PostgreSQL. Mock-only tests do not replace those checks.

| Level       | Tooling                                | Scope                                                                      |
| ----------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Unit        | Vitest                                 | Pure functions, Zod schemas, services (repositories mocked or in-memory)   |
| Component   | Vitest + `@nuxt/test-utils` + VTU      | Components and composables in the Nuxt environment                         |
| Integration | Vitest + real PostgreSQL               | HTTP routes end to end: happy path, Zod reject, 401 guest, 403 per missing Permission |
| E2E         | Playwright (+ axe)                     | One spec per view: axe in `fa` and `en`, plus an RTL `dir` check           |

- Tests live under `tests/{unit,integration,e2e}/<feature>/`, mirroring the source layout; they are never colocated with application code.
- Integration tests use a real database, never SQLite, created from the schema and the real Permission seed in a throwaway database.
- Coverage is a signal, not a goal. There is no coverage gate and no coverage tooling; untested diffs are reviewed by hand.
- Flaky tests are fixed or quarantined within a day. Bug fixes start with a failing test.

### Tests

How Projects write and name test support code.

- **Fixtures** live in `tests/fixtures/` and are named by role: `fake-<channel>.ts` for an external sender (`fake-push`, `fake-telegram`), `<entity>-factory.ts` for row builders (`access-factory`, `demo-ticket-factory`), `<area>-seed.ts` for e2e seeds. Deterministic factories; no shared mutable fixtures.
- **Integration support** lives in `tests/integration/support/`. The database harness creates, migrates and drops a throwaway database, runs the real Permission seed, and on cleanup truncates every schema table except the migrations table, so a Project never edits it when adding tables.
- **E2E data pattern.** Each spec seeds its own prefixed rows and cleans them up. Sign-in uses the mock-OTP helper in `tests/e2e/support/`. The shard template database is migrated and given the production seed only (Permissions, `super`, Default admin); the dev seed never reaches test databases.
- **Optional pieces.** A piece that is Off still has its tests run, against fakes (ADR-0029). A removal checklist lists the piece's tests and fixtures.
- **New domain minimum:** a unit test for the pure rules util; an integration test per route; one component test per view; one e2e spec per view; the Permission, Dashboard and notification completeness tests green. No new architecture test.

## Alternatives considered

- Coverage threshold gate: encourages shallow tests; reviewing diffs finds real gaps.
- SQLite or an in-memory stand-in for the database: hides constraint, trigger and transaction behavior.
- Colocated test files: mixes test-only files into production directories.

## Consequences

- Positive: refactors and migrations are safe; accessibility regressions fail the build.
- Negative / trade-offs: integration and e2e tests need Docker locally; the e2e tier lengthens CI, so it is sharded.
- Follow-ups: revisit sharding when the suite outgrows three shards.
