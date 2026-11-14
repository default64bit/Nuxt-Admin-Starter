# Architecture

Companion to the ADRs: it shows the repository layout and the dependency rules in one place. If it disagrees with an ADR, the ADR wins and this file gets fixed. Tables are in [architecture/data-model.md](architecture/data-model.md); operations are in the other files of [architecture/](architecture/).

## What the system is

One Nuxt 4 application serving a cached landing page, a phone-OTP sign-in and a private, permission-gated admin panel (`/admin`, English under `/en/admin`), backed by PostgreSQL. A second process, the notification worker, delivers outbox messages. Everything runs in Docker Compose, with Optional pieces (media storage, error tracking, edge proxy, backups, VPS deploy, Telegram, Web Push) that can be turned Off or Removed without breaking the rest (ADR-0029).

```
Browser ── same-origin /api/v1/... ──► Nitro server (Nuxt) ──► PostgreSQL
   │                                        │
   │ pages (SSR, Vue Query)                 └─ outbox rows ──► notification worker ──► Channels
   └─ admin PWA + service worker                                  (Inbox always; Telegram, Web Push optional)
```

## Repository layout

```
app/                         Nuxt 4 client code (ADR-0002)
  pages/                       index.vue (landing), sign-in.vue, admin/** (one folder per section)
  layouts/                     default.vue, admin.vue
  components/ui/               shadcn-vue primitives (do not edit their logic)
  components/admin/            admin compositions: shell, sidebar, inbox, dashboard/, board/
  components/<feature>/        one folder per domain (the demo: demo-ticket/)
  composables/admin/           shell and shared admin state (nav counts, inbox, dashboard)
  composables/<feature>/       Vue Query composables per domain
  middleware/, plugins/        auth and admin guards; Vue Query, toast and hydration plugins
  utils/, lib/                 cross-feature helpers only when truly shared
  assets/css/tailwind.css      Tailwind v4 entry: tokens, fonts, hues (docs/guides/theming.md)
server/                      Nitro server code (ADR-0005)
  api/v1/admin/**              route handlers: validate, authorize, call a service
  api/_auth, api/health        session and health endpoints
  routes/                      the admin PWA manifest
  middleware/                  request id, CSRF, private-route guard
  plugins/                     CSP, HTTP policy, environment validation, sign-in wiring
  services/                    business rules and transactions (no HTTP types)
  repositories/                all database access
  database/                    schema/, migrations/, seeds/, client and types
  notifications/               Channel registry, outbox, providers, push
  workers/                     the notification worker entry
  utils/                       parsing, logging, errors, session, analytics cache
shared/                      code both sides import (ADR-0002)
  constants/                   typed catalogues: permissions, audit actions, nav, dashboard modules, notification events
  schemas/                     Zod request/response schemas
  utils/                       pure rules and helpers
  admin-worker/                service-worker logic shared with its bundle
i18n/                        locales/<area>.<locale>.json messages; README.md, unapproved.md
tests/                       unit, components, integration, e2e, infra, starter (ADR-0017)
scripts/                     db, demo removal, ops, docker, release helpers
docs/                        adr/, guides/, architecture/, optional-pieces/, agents/
.specs/                      constitution, decision log, living feature specs
```

Features are grouped by name inside each Nuxt directory (ADR-0003): a domain called `invoice` has `app/components/invoice/`, `app/composables/invoice/`, `app/pages/admin/invoices/`, `server/api/v1/admin/invoices/`, `server/services/invoice.service.ts`, `server/repositories/invoice.repository.ts`, `server/database/schema/invoice.ts`, `shared/schemas/invoice.ts` and `tests/integration/invoice/`.

## Dependency rules

Server, one direction only (ADR-0005):

```
server/api/*  →  server/services/*  →  server/repositories/*  →  server/database/*
```

- A route handler parses input with Zod (ADR-0008), authenticates and authorizes (a `require*` gate first), calls one service and returns the result. It holds no SQL and no business rule.
- A service takes plain arguments plus the acting User, never an `H3Event`. It opens the transaction, applies the rules, records the audit event and any Notification event inside it, and throws a domain error that the handler translates (ADR-0009).
- A repository holds every Drizzle query and receives the database or the transaction. It holds no business rule.
- `server/` imports services and repositories explicitly; nothing reaches the database from another layer.

Client:

- Pages and components compose; application data comes only from a feature composable using Vue Query. `$fetch` appears only inside a query or mutation function (ADR-0011). Vue Query data is never mirrored into Pinia; Pinia holds client-owned state only.
- Components compose `components/ui/` primitives and shared tokens (ADR-0012); every string is an i18n key with `fa` and `en` values.

Shared:

- `shared/` imports nothing from `app/` or `server/`. It holds what both sides need: the catalogues, schemas and pure rules. Because it is framework-free, the server and the client agree on keys, limits and statuses without copies.

Cross-cutting:

- Authentication is a phone OTP with a server-side session (cookie holds an opaque token; only its hash is stored). Every protected action checks its Permission on the server; the UI only mirrors it (ADR-0010).
- Every state-changing admin route is audited in the write transaction. The audit log is append-only at the database level (ADR-0016).
- Notifications are written to the outbox in the same transaction as the business change and delivered afterwards by the worker; a delivery failure never rolls business state back (ADR-0021).

## Extension points: the catalogues

The Starter grows by adding to typed catalogues, each with a completeness test that fails when a piece is missing. Add to the catalogue, not around it ([guides/add-domain.md](guides/add-domain.md)).

| Catalogue | File | Completeness test |
| --- | --- | --- |
| Permissions and groups | `shared/constants/permissions.ts`, `permission-catalog.ts` | `tests/unit/shared/permission-catalog.test.ts` |
| Audit actions and operations | `shared/constants/audit-actions.ts`, `admin-operations.ts` | `tests/unit/shared/admin-operations.test.ts` |
| Admin navigation, hues, nav-count queues | `shared/constants/admin-nav.ts`, `shared/utils/admin-live-inbox.ts` | `tests/unit/shared/admin-nav.test.ts`, `tests/unit/architecture/admin-placeholder-pages.test.ts` |
| Notification events | `shared/constants/notification-catalog.ts` | `tests/unit/shared/notification-catalog.test.ts` |
| Dashboard modules | `shared/constants/dashboard-modules.ts` | `tests/unit/shared/dashboard-modules.test.ts` |

## Rendering and caching

The landing page is cached; the admin and sign-in pages are private and `no-store`; `ssr: false` is not allowed for pages (ADR-0013). Cached pages get a hash-based CSP (ADR-0022); state-changing requests are checked by request origin (ADR-0023). The admin panel registers a service worker for Web Push and the PWA install (ADR-0028).

## Runtime topology

`compose.yaml` declares the services; `compose.dev.yaml` and `compose.prod.yaml` specialise them. Core services are PostgreSQL, the app and the notification worker. `COMPOSE_PROFILES` (`media`, `monitoring`, `edge`, `backup`) adds the Optional infrastructure. Images are built once per commit in CI and deployed by SHA (ADR-0020). See [architecture/local-development-deployment.md](architecture/local-development-deployment.md), [architecture/monitoring-backups-tls.md](architecture/monitoring-backups-tls.md), [architecture/vps-runbook.md](architecture/vps-runbook.md) and [architecture/vps-bootstrap-checklist.md](architecture/vps-bootstrap-checklist.md).

## Where to read more

- Rules and reasons: `docs/adr/` (index in `docs/adr/README.md`)
- Terms: `CONTEXT.md`; confirmed product decisions: `.specs/decision-log.md`
- Adding a domain: [guides/add-domain.md](guides/add-domain.md); branding: [guides/theming.md](guides/theming.md)
- Removing an Optional piece: [adr/0029-optional-pieces.md](adr/0029-optional-pieces.md) and `docs/optional-pieces/`
