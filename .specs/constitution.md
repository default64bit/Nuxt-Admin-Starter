# Nuxt Admin Starter Constitution

This constitution is part of the Starter. A Project created from it inherits these principles as its starting rules and owns its copy: it may add principles and addenda, and amends the rest through the Governance section below.

## Core Principles

### I. Minimal First, Complexity on Demand

The system MUST launch with the smallest model that satisfies the current spec. Speculative complexity (event-driven or saga pipelines, extra providers, extra Channels, plugin frameworks) MUST NOT be built until a concrete spec calls for it. Every spec and plan MUST declare which phase it belongs to (MVP vs. Phase 2+) so scope creep is visible at review time.

**Rationale**: keeps the spec → plan → tasks → implement loop fast, and keeps each review small enough to actually review.

### II. Everything Authenticated Except the Landing Page and Sign-in

The public surface is the landing page and admin sign-in. Every other page and every `/api/v1` route MUST require a valid session; an unauthenticated request gets no admin data. Health probes and static assets carry no application data. Accounts are created only inside the panel by a User holding the right Permissions, and every User holds at least one Role. Sign-in answers a known and an unknown phone number identically, so it does not reveal who has an account.

Sessions end after 30 minutes idle or 12 hours in total, for every User. Disabling a User revokes their sessions, and a change to Roles or Permissions takes effect by the next server request at the latest. Session handling, OTP verification and cookie flags are specified in `.specs/authentication/spec.md`; Users, Roles and Permissions in `.specs/users-and-roles/spec.md`.

### III. Accessible, Mobile-First, Token-Driven UI, RTL and LTR

Interactive UI MUST use shadcn-vue components and their Reka UI primitives where suitable rather than duplicating accessible interaction logic. Layouts MUST be mobile-first. Custom components MUST preserve keyboard behavior, focus visibility, semantic labels, accessible state announcements and relevant ARIA semantics. Every view MUST pass axe checks in both locales.

The panel ships two locales: `fa` (Persian, RTL, Jalali dates, Persian digits) and `en` (English, LTR, Gregorian dates, Western digits). Every view MUST render correctly in both directions, using logical (start/end) properties rather than left/right, and `fa` is the default locale.

There is one visual surface on the stock shadcn neutral tokens. Tailwind CSS v4 theme configuration is CSS-first in the stylesheet referenced by `nuxt.config.ts`; canonical token values are defined once as CSS variables and `@theme inline` maps utilities to them. A competing legacy `tailwind.config.*` token source MUST NOT be added. Components MUST consume shared tokens and variants rather than hardcoded hex colors or one-off styles. The six status tones (neutral, info, progress, warning, success, danger) are the only way a status gets a colour. Light and dark modes are both supported; the mode is applied before first paint, and portal-rendered content (dialogs, menus, selects, popovers) MUST follow the active mode. Missing designs for loading, empty, validation, disabled, success, failure and responsive states MUST be completed from the closest existing pattern without changing product behavior.

### IV. Production-Grade Security by Default

Non-negotiable from the first deploy, not deferred to later hardening:

- HTTPS-only in production; secure cookie flags on all session cookies.
- CSRF protection on all state-changing routes (request-origin checks).
- Server-side input validation with Zod on every Nitro route; never trust client-supplied data, including identifiers, Permissions and counts.
- Parameterized queries only, via Drizzle ORM; no string concatenation into SQL.
- Authorization on the server for every protected action and sensitive read; the UI only mirrors it.
- Rate limiting on authentication endpoints.
- Secrets live in server-only environment variables, never in client bundles, logs, images or version control. `.env.example` holds placeholders only.
- Administrative changes and sensitive reads are recorded in an append-only audit log, enforced in the database. Audit records, logs and Notification payloads never contain OTP codes, secrets or unnecessary personal data.

### V. Performance as a Requirement

Pages MUST be rendered on the server with performance in mind. Lists MUST be paginated. Columns used for filtering and search MUST be indexed. Core Web Vitals (LCP, CLS, INP) are acceptance criteria on relevant specs, not optional polish.

A page MUST NOT repeat a request whose result is already available and still valid. Data fetched during server rendering MUST be reused on the client. A second request is allowed only when the data is stale or a user action requires fresh data.

SEO matters only for the landing page, which uses a cached rendering mode that keeps its HTML crawlable and avoids rebuilding it on every request. Admin pages are private, uncached and `noindex`. Concrete budgets live in the ADRs and CI that own them (the Dashboard response budget and the chart chunk budget); a budget is checked where it can be measured and is not restated per feature.

### VI. Data Models Before Implementation

No feature that reads or writes the database MAY be implemented until its entities, columns, relations, indexes, uniqueness, nullability, ownership and transactional invariants are specified. Each database entity MUST have a model with explicitly defined columns. Relations between entities MUST be specified before the Drizzle schema or application code for that area is written. Interfaces that cross the Nitro boundary MUST be defined in the same spec pass and validated with Zod where they accept input.

### VII. TypeScript and Nuxt Frontend Architecture

The whole project MUST be written in TypeScript: Vue pages and components, composables, Pinia stores, Drizzle ORM usage, and every Nitro route, utility and middleware. New source files MUST NOT be JavaScript.

The frontend MUST follow current Nuxt practices:

- Reused logic MUST live in composables. Pages and components call those composables instead of copying the logic.
- Shared client-owned state lives in Pinia when it has multiple consumers. Small SSR-safe values MAY use Nuxt `useState`. A page-local value is only for state no other part needs. Remote request data is cached by Vue Query (Principle VIII) and MUST NOT be mirrored into Pinia.
- Pages and components that load their own data MUST use Suspense so each region loads independently. One slow region MUST NOT block the rest of the page.
- Each region MUST handle its own failure and render the failure state defined for it. A failed component MUST NOT replace the whole page with a single error unless the page itself cannot be rendered.

### VIII. Same-Origin API and Vue Query

Frontend requests for application data MUST go through Vue Query (`@tanstack/vue-query`). Pages and components MUST NOT call `fetch` or a raw HTTP client for application data; `$fetch` may be the transport inside a query or mutation function.

The browser MUST call only the application's own origin. The API is implemented by Nuxt Nitro routes under `server/api/v1/` and runs on the same origin as the panel. If a separate backend is introduced later, it MUST be reached server-side without exposing its base URL or credentials to the browser, and Vue Query calls stay on same-origin `/api/v1/...` URLs.

### IX. External Providers Behind Seams

Every external dependency whose vendor can change (SMS sending, object storage, Telegram, Web Push, error tracking) is reached through an internal interface with a mock or fake adapter for development and tests. Route handlers, components and domain services MUST NOT call a vendor API directly. A vendor adapter is selected by configuration; missing configuration means the piece reads "not configured" and never fails startup, readiness or CI. Swapping a vendor MUST NOT touch domain code.

### X. Reliable Notifications

Notifications are supporting delivery mechanisms, not the source of business truth. A failure in a Channel (Telegram, Web Push) or in the Inbox write path MUST NOT roll back a committed domain transition. A Notification event is recorded in the same transaction as the change that raises it, delivered after commit through the outbox, and resolved where the task it points to ends. Events MUST be idempotent: a replay never creates a second logical Notification. A Notification addressed to one User is visible only to that User and only while they hold its gating Permission. Payloads MUST NOT contain secrets, free-text user input or unnecessary personal data.

A Channel is a delivery route, never an authorizer. Linking a Channel requires verified ownership of the destination by an active User, and a Channel can never grant access to the panel. Each Channel has an environment kill switch and a circuit breaker so that a broken Channel never blocks the application.

## Technology Stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript for the whole project, including Nitro server code |
| Framework | Nuxt 4. The API is Nitro, same origin, `/api/v1/...` |
| Data fetching | Vue Query (`@tanstack/vue-query`) |
| Database | PostgreSQL via Drizzle ORM |
| Validation | Zod, on Nitro inputs and on specified interfaces |
| Internationalization | `@nuxtjs/i18n`; locales `fa` (default) and `en` |
| Auth | `nuxt-auth-utils`, server-side sessions; phone OTP |
| Security | `nuxt-security` plus request-origin CSRF checks |
| UI components | shadcn-vue via `shadcn-nuxt` (Reka UI underneath) |
| Styling | Tailwind CSS v4, mobile-first, CSS-variable tokens |
| Client state | Pinia for shared client-owned state |
| Frontend structure | Nuxt composables for reused logic; Suspense per data region |
| Runtime and tooling | Node.js 24, pnpm, `just` |
| Hosting | Docker Compose; the VPS deploy is an Optional piece |
| Testing | Vitest (unit and server routes), Playwright with axe (end to end) |

Changing anything in this table is a constitution amendment, not a per-feature decision made in passing.

## Development Workflow

Spec-first development is the required workflow. The repository's source of truth is `.specs/`. For a meaningful change, move through: understand the current spec → identify gaps and conflicts → record product decisions → update the spec and acceptance criteria → specify data contracts and architecture → break work into tasks → implement → test against the criteria. Every implementation plan MUST include a constitution check. `AGENTS.md` holds the loop in full.

1. Data models, relations, invariants and interfaces are specified before database-backed implementation of the area they describe (Principle VI).
2. UI work follows Principle III: shared tokens and primitives, both locales and directions, every state completed.
3. Frontend and Nitro code follows Principle VII: TypeScript, composables, deliberate shared-state ownership, independent Suspense regions and a failure state per region. Remote data uses Vue Query and same-origin `/api/v1` URLs (Principle VIII). Rendering follows Principle V.
4. A new Permission, audit event, Notification event or Dashboard module is added through its catalogue or registry, and the completeness test for that catalogue stays green.
5. Unknown or conflicting business rules MUST be added to `.specs/decision-log.md`. Agents MUST NOT silently decide them in code.

## Governance

This constitution supersedes ad hoc decisions made during implementation. Specs and plans MUST be checked against the current version before implementation begins. Amendments require a stated rationale, a semantic version bump (MAJOR for incompatible principle changes or removals, MINOR for new principles or materially expanded guidance, PATCH for wording or clarification) and an updated Last Amended date below.

A Project that adds its own principles or addenda records them here, below the addenda, and bumps the version.

**Version**: 1.0.0 | **Ratified**: 2026-11-09 | **Last Amended**: 2026-11-09

## Runtime operations addendum

- The Docker Compose stack runs the Nuxt app, the notification worker and PostgreSQL. Each Optional piece adds its own services behind a Compose profile: object storage (`media`), GlitchTip error tracking (`monitoring`), the Caddy edge proxy (`edge`) and the backup job (`backup`). One `COMPOSE_PROFILES` list is the single switch for them.
- When the `edge` profile is on, Caddy is the only public ingress and uses automatic certificates with persistent renewal state. When it is off, the Project brings its own proxy and the app port is published. PostgreSQL, object storage and the error-tracking port are never public.
- A missing configuration for any Optional piece or Channel means "not configured". It MUST NOT fail startup, readiness, CI, local operation or deploy, and the application MUST boot with every Optional piece Off.
- Error reporting is best effort and privacy-scrubbed. The application, its readiness probe and CI MUST remain functional when GlitchTip or its DSN is absent.
- Production images are built once per commit in CI and deployed by SHA, never built on the server. Deploys are pull-based: credentials live only on the host, and a failed deploy reverts automatically.
- Backups cover the database only, to an off-host bucket. A missing backup destination is a non-blocking warning. Do not claim a recovery objective is met until the destination is configured and a restore has been verified.
- Database migrations are committed, reviewed and applied by a versioned process; seeds are idempotent and never overwrite data that Users manage in the panel.
