# Audit log

Living spec for the audit log: what is recorded, how it is stored and who can read it. Terms (User, Role, Permission, Actor) are in `CONTEXT.md`.

## Outcome

Changes to sign-in, Users, Roles and My account are recorded as append-only audit events with before and after values. A User with `view-audit-log` reads them on the Audit log page and narrows them with filters.

## Data model

Table `admin_audit_events` (in the `0000_baseline` migration, `server/database/schema/audit.ts`):

| Column | Notes |
| --- | --- |
| `id` | uuidv7 primary key |
| `actor_user_id` | nullable FK to `users` (`restrict`); null = the system |
| `action` | text, not blank; a key from `shared/constants/audit-actions.ts` |
| `entity_type`, `entity_id` | text; `entity_id` is a uuid string for Users and Roles, null when there is none |
| `outcome` | enum `audit_outcome`: `success`, `denied`, `failed` |
| `change_summary` | jsonb, redacted (see below) |
| `reason` | nullable text, shown quoted on the card |
| `correlation_id` | the request id, to match an event to the structured logs |
| `created_at` | timestamptz, UTC |

Indexes: time (desc), `(entity_type, entity_id, created_at desc)`, `(actor_user_id, created_at desc)`.

Append-only is enforced by the database: triggers reject `UPDATE`, `DELETE` and `TRUNCATE` (hand-written block at the end of the baseline, between the `hand-written-sql:start` and `hand-written-sql:end` lines; re-append it whenever the baseline is regenerated, together with the `super` Role protection). Users are never deleted, so the foreign key never blocks anything.

`change_summary` never holds one-time codes, tokens or secrets. Shapes: `{ old, new }` pairs (changed fields only), `{ added, removed }` lists, or plain values. Phone numbers are masked (`+98•••••6789`).

## Action-key registry

`shared/constants/audit-actions.ts` is the one catalogue: key, group. Labels are `admin.auditLog.actions.<lowerCamel key>` in both locales; an unknown stored key is shown raw under "Other", never hidden. A test (`tests/unit/shared/admin-operations.test.ts`) checks every mutating admin route has an operation row naming a known action. A Project adds its own rows when it adds audited actions.

| Group | Keys | Written by |
| --- | --- | --- |
| people | `user.create`, `user.update`, `user.roles`, `user.disable`, `user.enable`, `role.create`, `role.update`, `role.delete` | `admin-users.service.ts`, `admin-roles.service.ts` |
| account | `account.update`, `account.change_phone` | `account.service.ts`, `phone-change.service.ts` |
| auth | `auth.sign_in`, `auth.sign_out` | `auth.service.ts` (`verifyOtp`), `session.service.ts` (`logout`) |
| system | `audit.attempts_suppressed` | the flood control below |

## Requirements

### Events are written with the change

- GIVEN a service mutation, WHEN it succeeds, THEN its `success` event was written in the same database transaction; if either fails neither is committed. Handlers never touch the audit table.
- A save that changes nothing (same names, same Role set, same Role name and Permissions) writes no event.
- `user.update` and `account.update` record only the changed name fields as `old`/`new`; `user.roles` records `added` and `removed` Role ids; `role.update` records the name pair when it changed plus `added`/`removed` Permission keys; `user.disable`/`user.enable` record the status pair; `role.create`, `role.delete` and `user.create` record the plain values.
- `auth.sign_in` is written when a code is accepted; `auth.sign_out` only when a live session was actually ended (repeating it or signing out as a guest writes nothing). Failed sign-ins are not audited (no known Actor; the OTP attempt limits handle them).

### Refused attempts are recorded safely

- GIVEN a signed-in User, WHEN a mutating admin route answers `403 forbidden` / `own_account` / `super_required` or `409 default_admin_protected` / `super_role_protected`, THEN a best-effort `denied` event is written under the operation's action (`shared/constants/admin-operations.ts`) with `{ reasonCode, method, route }`. Nothing else is read from the request: no body, query, headers or Permissions.
- The write runs after the answer is decided, in its own short transaction with a 2 s timeout, and never throws or changes the answer; a failure leaves one `audit_write_failed` log line.
- The same refusal (same User, action, entity, reason) is written once per 15 minutes. At most 20 refusals per User per 24 hours are written; then one `audit.attempts_suppressed` marker and nothing more. Skipped attempts leave an `admin_attempt_not_recorded` log line.
- Validation (400), not found (404), stale versions (409) and throttling (429) are not audit events.

### Reading the log

- `GET /api/v1/admin/audit-log`, `/audit-log/actors` and `/audit-log/:id` require `view-audit-log`: 401 for a guest, 403 without the key. Reading writes no event.
- The feed is newest first, 20 per page, with an opaque keyset cursor over `(created_at, id)` (no totals); a bad cursor restarts at the newest.
- Filters combine with AND: `q` (an exact entity id or request id), `group` (derived from the registry), `actor` (a User id or `system`), `from`/`to` (inclusive Asia/Tehran days). The page keeps all of them and the cursor in the URL; invalid values are dropped and the address cleaned.
- The list item carries a change count, never the raw summary; the card fetches the full event when first opened (change rows, the first five with "Show all", then key, group, entity and request id). An Open link to the User or Role page shows only if the record still exists and the viewer holds `view-users` / `view-roles`.

### Page

- `/admin/audit-log` (permission `view-audit-log`; missing key = 403). Loading skeleton, empty ("No audit events yet" / "No events match these filters" with Clear filters), error with retry, Previous/Next with focus moved to the feed heading. `fa` (RTL, Jalali dates, Persian digits) and `en`.

## Tests

- `tests/integration/audit/audit-log.test.ts`: update/delete/truncate fail; user, role and sign-in/out events with before/after; a denied attempt written once; 401/403 and filters.
- `tests/integration/auth/my-account.test.ts`: the `account.*` events.
- `tests/unit/shared/admin-operations.test.ts`: the operation registry covers every mutating admin route.
- `tests/e2e/admin-audit-log.spec.ts`: feed, filters, details, axe and direction in both locales.

## Deferred

Event sentences, an entity-history chip and Telegram/Web Push audit rows were not carried; the card always shows the label, actor and change count. Retention/purging is out of scope for v1 (no automatic expiry).
