# Add a domain

This guide turns the **Reference module** (the demo ticket domain) into the Project's first real domain, and is the checklist for every domain after it. The committed `add-domain` skill (`.agents/skills/add-domain/SKILL.md`) wraps it for coding agents: the skill runs the spec-first loop from `AGENTS.md`, then follows these steps. A developer follows the same steps by hand.

Below, `<domain>` is the kebab-case singular name (`invoice`), `<domains>` the plural used in URLs and nav (`invoices`), and `Invoice` its PascalCase form. The demo uses `demo-ticket` / `demo-tickets` / `DemoTicket`.

## How the demo is marked

- Every demo-only **path** contains `demo-ticket`. List them with `git ls-files | grep demo-ticket`.
- Every **shared touch-point** (a line inside a file the whole app shares, such as the Permission list) is wrapped in `demo-ticket:start` / `demo-ticket:end` comments. Find them all with `git grep -n "demo-ticket:start"`.
- A file tagged `demo-ticket:start (whole file)` is deleted as a whole by `just demo-remove`.

The rule of the guide: **copy the demo's shape, never edit the demo in place.** Copy each marked file or block, rename it to the domain, and leave the demo working until step 11.

## 1. Spec

Copy `.specs/demo-tickets/spec.md` to `.specs/<domains>/spec.md` and rewrite it: outcome, data model, requirements as `GIVEN / WHEN / THEN` scenarios (the normal path plus each boundary and failure), Permissions and audit, placement, verification. Business ambiguity goes to the product owner as a proposed default marked unconfirmed (`AGENTS.md`, spec-first loop). Do not write code before the spec and the data model in it are agreed.

## 2. Decision log and glossary

- Append the confirmed product decisions to `.specs/decision-log.md` under a topic heading for the domain.
- Add the domain's terms to `CONTEXT.md` (with an `_Avoid_` list for synonyms you will not use). Use these exact words in code, messages and tests.

## 3. Copy the marked files and rename

Copy each demo path to its domain name and rename identifiers consistently (`demo-ticket`, `demoTicket`, `DemoTicket`, `DEMO_TICKET`, `demo_ticket`):

| Layer | Demo file | Copy to |
| --- | --- | --- |
| Constants | `shared/constants/demo-ticket.ts` | `shared/constants/<domain>.ts` |
| Request/response schemas | `shared/schemas/demo-ticket.ts` | `shared/schemas/<domain>.ts` |
| Pure rules | `shared/utils/demo-ticket-rules.ts`, `shared/utils/demo-ticket-list-url.ts` | `shared/utils/<domain>-*.ts` |
| Schema | `server/database/schema/demo-ticket.ts` | `server/database/schema/<domain>.ts` |
| Repository | `server/repositories/demo-ticket.repository.ts` | `server/repositories/<domain>.repository.ts` |
| Service | `server/services/demo-ticket.service.ts` | `server/services/<domain>.service.ts` |
| Routes | `server/api/v1/admin/demo-tickets/*.ts` | `server/api/v1/admin/<domains>/*.ts` |
| Page and components | `app/pages/admin/demo-tickets/index.vue`, `app/components/demo-ticket/` | `app/pages/admin/<domains>/`, `app/components/<domain>/` |
| Composable | `app/composables/demo-ticket/useDemoTickets.ts` | `app/composables/<domain>/use<Domains>.ts` |
| Messages | `i18n/locales/demo-ticket.{en,fa}.json` | `i18n/locales/<domain>.{en,fa}.json` |
| Dev seed | `server/database/demo-ticket-dev-seed.ts`, `scripts/db/demo-ticket-dev-seed.ts` | optional; the same names for the domain |

Keep the layers (ADR-0005): routes only validate, authorize and translate; services hold rules and open transactions; repositories hold every query. Do not copy the `demo-ticket:start/end` marker comments into your files: they belong to the demo only.

Register the new files where the app discovers them:

- `server/database/schema/index.ts`: add `export * from "./<domain>";`.
- Message files named `<domain>.en.json` and `<domain>.fa.json` in `i18n/locales/` are merged automatically (`localeFiles` in `nuxt.config.ts`); nothing to register.
- The messages follow the key convention in `i18n/README.md`; every key exists in both locales, and Persian copy you write is listed in `i18n/unapproved.md` until the owner signs it off.

Keep what the demo already proves: Table, Cards and Board views over one query (the views are presentation only, ADR-0027), 20 per page with Previous and Next, newest first, one create/edit dialog, hard delete behind a confirm, open by link. Drop what the domain does not need (the Board, the waiting chip).

## 4. Schema and its own migration

1. Edit the copied `server/database/schema/<domain>.ts`: columns, nullability, foreign keys (`onDelete: "restrict"` toward Users: Users are never deleted), indexes (lists are newest first, so index `(created_at desc, id desc)`), uniqueness, and a CHECK constraint for every invariant. Timestamps are `timestamptz` (UTC).
2. `just db-generate <name>` produces the migration. **Read the SQL**, commit it with the schema, and never edit an applied migration.
3. `just db-prepare` applies it. `just db-check` verifies the chain.
4. Write the integration test that proves the invariants (step 10).

A domain gets its own migration after the demo's. Do not put a domain table in `0000_baseline`.

## 5. Permission keys

A Permission is a code-defined key; it is never created through the panel.

1. `shared/constants/permissions.ts`: add `view-<domains>` and `manage-<domains>` (and any finer key the spec needs) to `PERMISSION_KEYS`.
2. `shared/constants/permission-catalog.ts`: add a group id to `PERMISSION_GROUP_IDS`, the group to `PERMISSION_GROUPS`, and a prerequisite entry for **every** key (`manage-<domains>` requires `view-<domains>`; an empty list is a decision, not an omission).
3. Messages for each key (`admin.permissions.keys.<camelKey>.label` and `.hint`) and the group (`admin.permissions.groups.<id>.label` and `.hint`) in both locales.
4. Each route handler calls `requirePermission(event, "<key>")` first (`tests/unit/architecture/admin-guard.test.ts` enforces a guard in every admin handler). The page declares the same key in `definePageMeta({ permission })`. The UI only mirrors the server (ADR-0010).
5. Update the tests that list keys and groups: `tests/unit/shared/permission-catalog.test.ts` and `tests/unit/shared/admin-nav.test.ts`.

The seed reconciles the catalogue **add-only**: `just db-seed` inserts the new keys and grants every key to `super`. **Removing a key** is a hand-written migration (delete its `role_permissions` rows, then its `permissions` row) because the foreign key restricts; write it, review it, and remove the key from the code in the same commit. Renaming is a removal plus an addition.

## 6. Audit events

Every mutation of the domain is audited **inside the write transaction**.

1. `shared/constants/audit-actions.ts`: add a group to `AUDIT_GROUPS` and one action per event to `AUDIT_ACTIONS` (`<domain>.created`, `<domain>.updated`, `<domain>.deleted`, a status change, and so on).
2. `shared/constants/admin-operations.ts`: add an `ADMIN_OPERATIONS` row per mutating route (`"POST <domains>": op("<domain>.created", "<domain>")`). `tests/unit/shared/admin-operations.test.ts` fails for a mutating admin route without a row and for a row naming an unknown action. A route that only changes the signed-in User's own display preference goes in `ADMIN_PREFERENCE_ROUTES` instead.
3. In the service call `recordAudit(tx, auditContext, { action, entityType, entityId, changeSummary })` after the write, in the same `db.transaction`. The summary is redacted and small: changed fields, old and new, never a secret, a token or an OTP code.
4. Labels for the group, each action and each summary field under `admin.auditLog.*` in both locales.

## 7. Notification events (optional)

Add an event only if someone must act on work the domain raises. The Inbox is the always-on Channel; Telegram and Web Push follow the recipient's settings (ADR-0021, ADR-0028).

1. `shared/constants/notification-catalog.ts`: add an entry to `ATTENTION_TYPES`: `title` and `copy` in both locales, at most three non-personal `tokens` (never free text a User typed), the gating `permission`, `link`, `dedupe` and `source`.
2. A formatter for each token that needs one, in `shared/utils/attention-message.ts`.
3. `app/components/admin/inbox-icons.ts`: an icon in `INBOX_TYPE_ICONS` and a tint in `INBOX_TYPE_COLORS`.
4. In the service, call `recordNotificationEvent(tx, { type, ids, tokens, recipientUserId })` inside the write transaction (the recipient is optional: without one, everyone holding the Permission sees the item), and close the item with `resolveAttentionForSource(tx, type, entityType, id)` in the transaction that ends the work. A delivery failure never rolls the business change back: delivery happens later from the outbox.
5. `tests/unit/shared/notification-catalog.test.ts` is the completeness test: it fails when a field, a translation or an icon is missing.

### Re-point the Inbox tests

The Inbox tests use the demo's one event and are demo-marked, so `just demo-remove` deletes them: `tests/e2e/inbox.spec.ts`, `tests/integration/notifications/demo-ticket-notifications.test.ts`, and the demo-marked cases in `tests/integration/dashboard/dashboard-layout.test.ts` and `tests/e2e/admin-dashboard.spec.ts`. **Before removing the demo, copy those cases and re-point them at the Project's first event** (its factory, its Permission, its link). A Project with no event yet has an empty catalogue, which is valid; there is deliberately no test-only event.

## 8. Dashboard modules and the Needs attention row

### A Dashboard module

Add a module when a number or chart should sit on the Dashboard (`.specs/admin-dashboard/spec.md`). One registry entry plus lookups typed by the module key:

1. `shared/constants/dashboard-modules.ts`: a key constant and an entry in `DASHBOARD_MODULES` (gate Permission, allowed widths, default width, offered ranges and default, `inDefaultLayout`, preview kind).
2. `shared/schemas/admin-dashboard.ts`: the payload schema, added to `MODULE_PAYLOAD_SCHEMAS`.
3. `server/services/admin-dashboard.service.ts`: the loader, added to `MODULE_LOADERS`. Queries live in a repository, run under `withAnalyticsTimeout`, use `cache.remember` only for period data, and stay within the 300 ms p95 budget (ADR-0024; index first, then a rollup).
4. `app/components/admin/dashboard/module-components.ts`: the component. It composes the shared module card; charts use the three Chart styles (ADR-0025).
5. A hue variable and a `[data-dashboard-module="<key>"]` rule in `app/assets/css/tailwind.css` (see [the theming guide](theming.md)), and the title `admin.dashboard.modules.<camelKey>` in both locales.

`tests/unit/shared/dashboard-modules.test.ts` fails if any piece is missing. A saved layout naming a removed module repairs itself, so removing a module needs no migration.

### A Needs attention row

Needs attention lists the queues a User may open, one row per queue, and each count equals the menu badge. A row *is* a nav-count queue (step 9), so the recipe is five pieces:

1. The nav item gets a `countKey`: `item("<domains>", "work", 0, "view-<domains>", "<domains>", "open<Domains>")` in `shared/constants/admin-nav.ts`.
2. `NAV_QUEUE_COUNT_KEYS` in `shared/utils/admin-live-inbox.ts` gets the name.
3. `shared/schemas/admin-nav-counts.ts` gets the optional `open<Domains>` integer.
4. `getQueueCounts` in `server/services/admin-nav-counts.service.ts` gets one line: `if (actor.has("view-<domains>")) counts.open<Domains> = await countOpen(db);`.
5. The row label `admin.dashboard.needsAttention.rows.open<Domains>` in both locales.

## 9. Nav entry, nav-count queue and i18n

1. `shared/constants/admin-nav.ts`: a row in `ADMIN_NAV` (group, order, the gating key, the route segment). Add a group to `ADMIN_NAV_GROUPS` if the domain needs its own section, with its label under `admin.nav.groups.<id>`.
2. `app/components/admin/admin-nav-icons.ts`: a Tabler icon for the item key.
3. A hue for the section in `ADMIN_NAV_HUES` (see [the theming guide](theming.md)).
4. The label `admin.nav.items.<camelKey>` in both locales.
5. The page file at the route's path. `tests/unit/architecture/admin-placeholder-pages.test.ts` checks that every nav item has a page, declares the item's permission and has an icon.
6. **Nav-count queue** (a badge on the item): the `countKey` pieces of step 8, plus the domain's list query key in `LIVE_QUEUE_LIST_KEYS` (`app/composables/admin/useAdminNavCounts.ts`), so a poll that sees the count change refetches the list. A mutation that changes the count calls `useInvalidateNavCounts()`.
7. Admin pages are covered by `/admin/**` in `shared/utils/route-rules.ts` (private, `no-store`); never add `ssr: false`.

Every string is an i18n key with `fa` and `en` values. Use logical properties (`ms-*`, `ps-*`, `text-start`) and check each view in both directions.

## 10. Tests: the minimum

A domain is done when these pass (`AGENTS.md` step 8 lists the commands):

- **Rules unit test**: the pure functions in `shared/utils/<domain>-rules.ts` (transitions, derived values, URL state).
- **Per-route integration test** against the real database (`tests/integration/<domain>/`, using `useTestDatabase` from `tests/integration/support/database.ts`): the happy path, a validation reject (422), unauthenticated (401) and unauthorized (403). Add stale-version (409) and invariant cases where the schema has them.
- **One component test and one e2e spec per view**, the e2e spec with an axe check and the RTL/LTR check in both locales (copy `tests/e2e/demo-tickets-table.spec.ts` and `tests/e2e/demo-tickets-views.spec.ts`).
- **Completeness tests green**: Permissions (`permission-catalog.test.ts`), audit and operations (`admin-operations.test.ts`), the admin guard (`admin-guard.test.ts`), nav and pages (`admin-nav.test.ts`, `admin-placeholder-pages.test.ts`), notifications (`notification-catalog.test.ts`), Dashboard modules (`dashboard-modules.test.ts`), i18n key parity (`tests/unit/i18n/messages.test.ts`) and the array caps (`request-array-caps.test.ts`: every `z.array` in a request schema needs `.max()`).

`vitest related` does not see the dynamic-scan tests, so also run `pnpm exec vitest run tests/unit/architecture tests/unit/shared/admin-operations.test.ts tests/unit/server/cache-invariants.test.ts`.

## 11. Remove the demo

When the domain works end to end:

1. Re-point the Inbox tests (step 7) and any Dashboard case that used a demo module.
2. `just demo-remove`. Before any deploy it deletes the demo paths, strips the marked blocks and drops the demo migration; then run `just dev-reset` and `just db-prepare`.
3. Once a Project is deployed, use `just demo-remove deployed=true`: the demo migration stays and a normal migration dropping the demo tables is generated. **Inspect its SQL** before committing.
4. Run `pnpm typecheck`, lint and the tests. The code compiles with the demo gone because shared code reads catalogues through general-shaped helpers (an empty notification catalogue is valid).
5. Delete the demo-specific prose you no longer want in `docs/` and `CONTEXT.md`.

## Where a setting lives

Choose the first tier that fits. There is no admin settings page, by decision.

| Tier | Use it for | Where | Changing it |
| --- | --- | --- | --- |
| **Environment** | Secrets, hosts, ports, per-deployment switches, anything that differs between local, staging and production | A validated variable (`server/utils/runtime-config-schema.ts`, a placeholder in `.env.example`, ADR-0014) | Redeploy |
| **Code** | Product rules every deployment shares: limits, status lists, tone maps, thresholds, defaults, the app name and default locale (i18n messages and config) | A typed constant in `shared/constants/` or a message, under test | A commit |
| **Database singleton** | One value for the whole Project that an admin must change at runtime without a deploy | A table with a single fixed-key row, a `manage-…` Permission, an audit event on write, and a code default when the row is missing | The panel |
| **Per User** | A personal preference: a view, a sound, the Message language, the Dashboard layout | A row keyed by `user_id` (see `dashboard_preferences`, `notification_settings`), no Permission, not audited; a missing row means the default | The User |

The Starter ships no database singleton: add the first one only when a requirement needs it, with its own spec, migration and audit event. A secret or per-environment value is never a constant; a value no admin needs to change at runtime is never a database row.

## Related

- Theming and branding: [theming.md](theming.md)
- Layout and layering: [../architecture.md](../architecture.md); tables: [../architecture/data-model.md](../architecture/data-model.md)
- Reasons behind the rules: `docs/adr/`
