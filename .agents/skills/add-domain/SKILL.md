---
name: add-domain
description: Add a real domain to a Project built from the Nuxt Admin Starter by copying the demo-ticket Reference module, spec first. Use when the user wants to add a domain, entity, resource, feature area or admin section (for example invoices, projects, products), or says "add-domain".
---

# add-domain

A thin wrapper. The steps live in one place, the human guide `docs/guides/add-domain.md`; do not restate or improvise them here.

## 1. Run the spec-first loop

Follow `AGENTS.md` "Before touching code" and "Spec-first implementation loop" for the domain the user named:

1. Read `AGENTS.md`, `.specs/constitution.md`, `.specs/decision-log.md`, `CONTEXT.md`, `.specs/demo-tickets/spec.md` and the relevant ADRs.
2. Summarize the outcome. Find gaps: unclear words, preconditions, state transitions, validation, Permissions, invariants, failure paths, acceptance criteria.
3. For business ambiguity, propose a default and ask the product owner; mark it unconfirmed until approved.
4. Write `.specs/<domains>/spec.md` (Requirement, `GIVEN / WHEN / THEN`) and the data model (entities, columns, relationships, indexes, uniqueness, nullability, ownership, transactional invariants) before any code.

## 2. Follow the guide

Open `docs/guides/add-domain.md` and do steps 1 to 11 in order, using the demo files it names as the pattern. Do not skip Permissions, audit events, nav, i18n (`fa` and `en`) or the tests; skip notification events and Dashboard modules only when the spec does not need them, and say so.

## 3. Verify and report

Run the checks of `AGENTS.md` step 8 (typecheck, eslint on changed files, touched and related Vitest files, the dynamic-scan tests named in the guide, Playwright specs for touched pages). Report in the `AGENTS.md` handoff format: Spec(s), Implementation, Verification (say what was not run), Open decisions.
