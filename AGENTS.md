# Coding-agent instructions

These instructions apply to every coding agent working in this repository.

<!-- starter-meta:start -->

> **This copy has not been set up yet.** If you are in a Project created from the Starter (the section "Working on the Starter itself" below is still present), run `just first-run` first and only then start building. See that section.

<!-- starter-meta:end -->

## Agent skills

### Issue tracker

Issues live as GitHub Issues on `default64bit/Nuxt-Admin-Starter`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` (glossary), `.specs/decision-log.md` (confirmed product decisions), and `docs/adr/` (accepted technical ADRs). See `docs/agents/domain.md`.

### Installing skills

Third-party skills are pinned in `skills-lock.json` and restored with `npx skills experimental_install`. Do not commit third-party skills or the `.agents/skills/` and `.claude/skills/` directories they land in. The one exception is the first-party `add-domain` skill, which is committed together with its `.claude/skills/add-domain` symlink and the `.gitignore` negations that allow them.

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

## Technical constraints

Stack: TypeScript, Nuxt 4, Tailwind CSS v4, shadcn-vue/Reka UI, PostgreSQL + Drizzle ORM, Zod at server boundaries, Vue Query for server state, Pinia for client-owned state, Node.js 24, pnpm, `just`, Docker Compose. Each rule below links to the ADR that holds its reason (files are `docs/adr/NNNN-*.md`).

- Nuxt 4 directory layout: app code under `app/`, server code under `server/`, shared code under `shared/`. ADR 0002.
- Organize by feature, not by file type; the demo ticket domain is the example. ADR 0003.
- TypeScript everywhere, strict mode; no new JavaScript source files. ADR 0004.
- Layered server: all database access lives in repositories, business rules in services, and route handlers only validate, authenticate, authorize and translate results and errors. ADR 0005.
- PostgreSQL with Drizzle ORM; do not use another ORM. ADR 0006.
- Schema changes go through a generated, inspected and committed migration; never push a schema directly to a shared database. ADR 0007.
- Zod validates every server boundary (request bodies, queries, params, environment). ADR 0008.
- The API lives under same-origin `/api/v1/...` and follows the API conventions. ADR 0009.
- Authentication is phone OTP with server-side sessions; every protected action checks its Permission on the server, and the UI only mirrors it. ADR 0010.
- Do not call `$fetch` or `fetch` from a page or component for application data; use a feature composable with Vue Query (`$fetch` may be the transport inside the query or mutation function). Do not mirror Vue Query data into Pinia. ADR 0011.
- UI uses Tailwind v4 and shadcn-vue on the stock neutral tokens; no hardcoded hex colours and no CDN fonts. ADR 0012.
- Rendering: the landing page is cached, while admin and sign-in pages are private and `no-store`; `ssr: false` is not allowed for pages. ADR 0013.
- Configuration comes from validated environment variables; secrets stay server-side and out of the repository and images. `.env.example` holds placeholders only. ADR 0014.
- Errors, logs and observability: structured redacted logs and correlation ids; GlitchTip reporting is DSN-gated. ADR 0015.
- Security baseline: security headers, CSRF by request origin, rate limits, parameterized queries. ADR 0016. CSP by hashes for cached pages: ADR 0022. CSRF checks: ADR 0023.
- Testing: tests travel with their code, assert outcomes through the highest seam, and coverage is a signal, not a gate. ADR 0017.
- Code quality and git workflow follow ADR 0018.
- Runtime, package manager and dependencies: Node 24 and the pinned pnpm; do not import a package that `package.json` does not declare. ADR 0019.
- CI/CD and deployment: images are built once per commit in CI and deployed by SHA. ADR 0020.
- Notifications are delivered through a transactional outbox after commit; a delivery failure never rolls back business state. Recipients, the OTP-only `SmsProvider` and Channels are covered in ADR 0021.
- Dashboard analytics are live with a short cache and a 300 ms p95 per-module budget. ADR 0024. Charts use chart.js in one lazy chunk with three Chart styles. ADR 0025.
- Drag reordering exists only on the Dashboard grid, always with a menu alternative. ADR 0026.
- Admin list views (Table, Cards, Board) are presentation only; they never change the query. ADR 0027.
- The admin PWA, Web Push and the polled Inbox. ADR 0028.
- Optional pieces have two tiers (Off and Removed). ADR 0029.
- Never trust client-provided identifiers, Permissions, counts or statuses.
- Do not expose credentials to the browser or logs. Never log, audit or put an OTP code in a payload.
- Account deletion is out of scope: do not add hard-delete or soft-delete for Users. Disable instead; the Default admin cannot be disabled and always holds `super`.
- Persisted timestamps are UTC.
- Do not add dependencies, frameworks, registries or abstractions the accepted spec does not need.

## UI, RTL and i18n contract

- Two locales ship: `fa` (default, RTL, Jalali dates, Persian digits) and `en` (LTR, Gregorian dates, Western digits). Every user-visible string is an i18n key with both an `fa` and an `en` value; none is hard-coded in a component.
- Use logical properties and utilities (`ms-*`, `ps-*`, `start-*`, `text-start`, and so on) instead of left/right. Icons that imply direction flip in RTL. Check every UI change in both directions.
- Components compose the shadcn-vue primitives in `components/ui/`; do not copy primitive interaction logic. Keep keyboard behavior, focus visibility, labels, ARIA and disabled states.
- Colours come from the shared tokens. Status colours come only from the six tones (neutral, info, progress, warning, success, danger). Do not write hex literals.
- Portal content (dialogs, menus, selects, popovers) must follow the active light/dark mode.
- Complete the loading, empty, validation, disabled, success, failure and confirmation states and the mobile layout, even when no design shows them.
- Lists use Table, Cards or Board views over one query, 20 items per page with Previous and Next, newest first, no column sorting, and no infinite scrolling unless a spec says so.
- Every view gets an e2e axe check in both locales. Branding, fonts and hues: `docs/guides/theming.md`.

## Runtime, `just`, Compose and database invariants

- Node.js is 24 and pnpm matches the `packageManager` pin. Use the `just` recipes in the `justfile` for repeatable multi-step operations. One source per operation: package scripts do atomic commands, `just` sequences them, Docker Compose declares services.
- `just db-prepare` is idempotent: it starts dependencies, creates the database only if missing, applies committed pending migrations, runs only unapplied versioned seeds and prepares types. It never drops or resets data and never generates an unreviewed migration.
- Schema changes need `just db-generate <name>`, inspection of the SQL, tests, and a commit. Production uses migration files. `just db-push-local` is disposable and local-only. Never push a schema directly to staging or production.
- Two database triggers back application rules and must survive in the migration baseline: the audit log is append-only, and the `super` Role cannot be renamed, reduced or deleted.
- Seeds are safe to rerun and never overwrite data managed in the panel. The Permission reconcile is add-only and grants every key to `super`. The dev seed runs in dev only, never in production or test databases.
- The Default admin is created once from environment settings and never changed by later edits to them. If its phone is unset, the seed warns, skips and retries on the next run.
- `COMPOSE_PROFILES` (`media`, `monitoring`, `edge`, `backup`) is the one switch for infrastructure pieces. Do not add a second one. Missing config for any piece means "not configured", never a boot failure.
- Keep the runtime database role separate from the Postgres superuser. Object-storage root credentials never enter the app container. Never publish PostgreSQL, storage or error-tracking endpoints on a public interface.
- Never add secrets to the repository or an image. Production images are built in CI and deployed by SHA, never built on the server.
- Do not report a build, test, migration, Compose or infrastructure check as passed unless the command was actually run and succeeded.

## Reference module and adding a domain

The demo ticket domain is the **Reference module**: a complete, removable example from schema to pages and tests, with every demo path containing `demo-ticket` and every shared touch-point wrapped in `demo-ticket:start` / `demo-ticket:end` markers. To add a real domain, use the committed `add-domain` skill, which runs the spec-first loop above and then follows the human guide `docs/guides/add-domain.md`. When the new domain works, remove the demo with `just demo-remove`; add `deployed=true` once a Project is deployed.

Catalogues are the extension points, and each has a completeness test that fails when a piece is missing: Permissions, audit events, Notification events and Dashboard modules. Add to the catalogue rather than around it.

## Optional pieces

Seven pieces can be turned Off with no code change or Removed with a checklist: media storage, error tracking, Telegram, Web Push with the PWA, backups, VPS deploy and the edge proxy. Read ADR 0029 and the per-piece checklists in `docs/optional-pieces/` before touching one. Never make core code depend on an Optional piece being present.

## Acceptance criteria and tests

Acceptance criteria must be testable and user-observable. For each change, cover as applicable: success path and boundaries; invalid input and server-side validation; guest vs authenticated behavior and permission denial; loading, empty, success and error UI states; duplicate submissions and idempotency; RTL and LTR rendering for UI changes.

## Required handoff format

At the end of a task, report:

- **Spec(s):** paths and requirements addressed.
- **Implementation:** key files/changes and the reason for each.
- **Verification:** commands run and their results; say explicitly when tests were not run.
- **Open decisions:** unresolved questions and assumptions not yet approved.

<!-- starter-meta:start -->

## Working on the Starter itself

This section exists only in the Starter repository. `just first-run` deletes it when a Project is created.

- **In a copy of the Starter that has not been set up (a Project): run `just first-run` first.** It names the Project, chooses the Optional pieces and the demo, renames the Starter's slug and display names, and removes the Starter-only material, including this section. Run it non-interactively with named arguments (`just first-run name-en=… name-fa=… slug=… demo=keep|remove profiles=…`); it never prompts when stdin is not a terminal. Do not start building a domain on an unconfigured copy.
- **Working on the Starter repository itself:** read `docs/starter.md` before changing anything. It holds the boundary test, the copy-and-own rule, harvest-back PRs, the no-Source-history rule, the public-artifact rule and the release checklist.
- Everything shipped must pass the boundary test: an unrelated admin app (an HR tool, a helpdesk) would use it unchanged apart from names. No business content from the application the Starter was extracted from may appear anywhere (code, schema, i18n, tests, fixtures, comments, docs).
- This repository is public. Never commit local paths of other projects, code excerpts from them, secrets or business data.
- Workflow: push to `develop`; `main` changes only through a develop-to-main PR, and every merge is a tagged Starter release with Port notes in `CHANGELOG.md`.
- Wrap Starter-only text in `starter-meta:start` / `starter-meta:end` markers so first-run strips it.

<!-- starter-meta:end -->
