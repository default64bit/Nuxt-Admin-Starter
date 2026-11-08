# Coding-agent instructions

These instructions apply to every coding agent working in this repository.

> Stub. This file grows as the starter is extracted; sections marked _(planned)_ are filled in by later slices.

## Agent skills

### Issue tracker

Issues live as GitHub Issues on `default64bit/Nuxt-Admin-Starter`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` (glossary), `.specs/decision-log.md` (confirmed product decisions), and `docs/adr/` (accepted technical ADRs). See `docs/agents/domain.md`.

### Installing skills

Third-party skills are pinned in `skills-lock.json` and restored with `npx skills experimental_install`. Do not commit `.agents/skills/` or `.claude/skills/`.

## Before touching code

Read the following, in this order (skip any that do not exist yet):

1. `AGENTS.md`
2. `.specs/constitution.md`
3. `.specs/decision-log.md`
4. `CONTEXT.md`
5. The feature spec for the change under `.specs/<feature>/spec.md`
6. Relevant decisions under `docs/adr/` and `docs/architecture.md`

## Authority and conflict resolution

Use this precedence:

1. Security requirements and core engineering principles in `.specs/constitution.md`.
2. Confirmed decisions in `.specs/decision-log.md` and explicit requirements in the relevant feature spec. If a confirmed decision and a stale spec sentence conflict, correct the spec before implementation.
3. Accepted ADRs for technical choices.
4. `CONTEXT.md` for domain terminology.
5. Existing code as evidence of current behavior, not as authority when it conflicts with specs.

Do not silently resolve contradictions by choosing whichever source is easiest to implement. Update the specs/decision log or raise the smallest question that unblocks the work.

## Spec-first implementation loop

1. **Understand.** Summarize the user outcome and read the relevant requirements, decisions, glossary and architecture.
2. **Find gaps.** Identify unclear words, missing preconditions, state transitions, validation, permissions, data invariants, failure paths, dependencies and acceptance criteria.
3. **Resolve.** For business ambiguity, propose a default and ask the product owner. Mark proposals as unconfirmed until approved. Don't block unrelated specified work.
4. **Specify.** Requirements describe observable outcomes. Write scenarios as `GIVEN / WHEN / THEN` where a precondition matters. Cover the normal path and relevant boundary/failure conditions.
5. **Model.** Before database-backed work, specify entities, columns, relationships, indexes, uniqueness, nullability, ownership and transactional invariants. Define input/output schemas at API boundaries.
6. **Plan.** Break work into small tasks and tests. Include a constitution check and list assumptions/dependencies.
7. **Implement.** Make only the changes the accepted spec needs. Reuse shared patterns; avoid speculative frameworks and unrelated refactors.
8. **Verify.** Add tests for the acceptance criteria, then check only what the change can affect: `pnpm typecheck`, `pnpm exec eslint` on changed files, the Vitest files you touched plus `pnpm exec vitest related --run <changed files>`, and Playwright specs for touched pages/flows. Full suites run in CI and in an effort's final verification pass.
9. **Report.** Use the handoff format below.

## Technical constraints _(planned)_

Stack: TypeScript, Nuxt 4, Tailwind CSS v4, shadcn-vue/Reka UI, PostgreSQL + Drizzle ORM, Zod at server boundaries, Vue Query for server state, Pinia for client-owned state, Node.js 24, pnpm, `just`, Docker Compose. The full constraint list is added as ADRs are extracted.

## Acceptance criteria and tests

Acceptance criteria must be testable and user-observable. For each change, cover as applicable: success path and boundaries; invalid input and server-side validation; guest vs authenticated behavior and permission denial; loading, empty, success and error UI states; duplicate submissions and idempotency; RTL and LTR rendering for UI changes.

## Required handoff format

At the end of a task, report:

- **Spec(s):** paths and requirements addressed.
- **Implementation:** key files/changes and the reason for each.
- **Verification:** commands run and their results; say explicitly when tests were not run.
- **Open decisions:** unresolved questions and assumptions not yet approved.
