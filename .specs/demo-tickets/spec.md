<!-- demo-ticket:start (whole file) -->
# Demo tickets

Living spec for the demo ticket domain, the Starter's **Reference module**: a complete, removable example from schema to pages and tests. It is deleted whole by `just demo-remove`. Terms (User, Permission, Actor) are in `CONTEXT.md`; the confirmed decisions are the "Demo ticket" and "Lists" sections of `.specs/decision-log.md`. This file covers the Table view; the Cards and Board views, the image, the assignment Notification and the Dashboard modules add their own sections as they land.

## Outcome

A User with `view-demo-tickets` opens Demo tickets, searches by title, filters by status, priority and assignee, and pages 20 at a time, newest first. A User with `manage-demo-tickets` also creates and edits a ticket in one dialog, moves it one status forward, and deletes it after a confirmation. A link with `?ticket=<id>` opens that ticket's dialog. There is no detail page.

## Data model

Table `demo_tickets` (migration `0001_demo-tickets`, after the baseline; `server/database/schema/demo-ticket.ts`):

| Column | Notes |
| --- | --- |
| `id` | uuidv7 primary key |
| `title` | text, required, 1 to 200 characters after trimming (CHECK) |
| `description` | nullable plain text, at most 5000 characters; blank is stored as null |
| `status` | enum `demo_ticket_status`: `open` (default), `in_progress`, `resolved`, `closed` |
| `priority` | enum `demo_ticket_priority`: `low`, `normal` (default), `high` |
| `assignee_id` | nullable FK to `users` (`restrict`); only an active User can be assigned |
| `created_by` | FK to `users` (`restrict`), set from the session |
| `created_at`, `updated_at` | timestamptz, UTC; `updated_at` is the ticket's version |
| `status_since` | timestamptz; set on creation and on every status change; the waiting-long chip counts from it |
| `image_media_object_id`, `image_alt_fa`, `image_alt_en` | optional image (FK to `media_objects`, `restrict`) with Persian and English alt text; the alt texts are required once an image is set (CHECK) |

Indexes: `(created_at desc, id desc)` for the list, `(status, created_at desc)`, `assignee_id`. Users are never deleted, so the foreign keys never block anything. A ticket is hard-deleted.

## Requirements

### Requirement: Status moves forward one step at a time

Statuses are `open` → `in_progress` → `resolved` → `closed`. There is no skipping, going back or reopening. Tones: open `info`, in progress `progress`, resolved `success`, closed `neutral`. The rules are pure functions in `shared/utils/demo-ticket-rules.ts`, shared by the API and the pages.

#### Scenario: The next status is accepted
- GIVEN an `open` ticket
- WHEN a `manage-demo-tickets` User saves it with `status: "in_progress"` at the current version
- THEN the ticket is `in_progress`, `status_since` is now, and a `demo_ticket.status_changed` event is recorded

#### Scenario: Any other status is refused
- GIVEN an `open` ticket
- WHEN a save asks for `resolved` (skip), `open` (stay is a no-op, not an error) or, on a `resolved` ticket, `in_progress` (back)
- THEN a skip or a step back answers `409 invalid_transition` with the ticket's current status, and nothing is written

### Requirement: A waiting-long chip marks stale tickets

A ticket shows the "waiting long" chip when it has been `open` for more than 24 hours or `in_progress` for more than 48 hours, counted from `status_since` (exactly the limit is not yet long). Resolved and closed tickets never show it.

### Requirement: List, search and filters

`GET /api/v1/admin/demo-tickets` needs `view-demo-tickets`. It takes `q` (normalized contains-match on the title, Persian and Arabic letter and digit variants folded), `status`, `priority`, `assignee` (a User id, or `none` for unassigned) and `page`; it answers 20 items per page, newest first, with `total`. An invalid value answers `400 validation_failed`. The URL carries the same state (`q`, `status`, `priority`, `assignee`, `page`, `ticket`); an invalid value is dropped. Column sorting and a page-size selector do not exist.

#### Scenario: Filters combine
- GIVEN 25 tickets, one of them `high` and in progress
- WHEN the User searches the shared word, then filters Priority = High
- THEN one row shows; "Clear filters" returns the full list

#### Scenario: Paging
- GIVEN 25 matching tickets
- WHEN the User presses Next
- THEN page 2 shows the remaining 5 and the URL has `page=2`; a page past the end moves to the last page

### Requirement: Create and edit in one dialog

`POST` needs `manage-demo-tickets`. The body is `title`, optional `description`, `priority` (default `normal`) and optional `assigneeId`; a new ticket is `open`, created by the actor. `PATCH .../{id}` takes any of `title`, `description`, `priority`, `assigneeId`, `status` and the `expectedUpdatedAt` version it was loaded at (`409 stale_version` with the current ticket otherwise). The body is strict: an unknown key is refused. A save that changes nothing writes nothing and does not move the version. In the dialog the status field offers only the current and the next status. A User with only `view-demo-tickets` sees the same dialog read-only, with no Save and no Delete.

#### Scenario: Validation
- GIVEN the New dialog
- WHEN the User submits an empty title
- THEN "This field is required." shows on the title and nothing is sent; a title over 200 characters is refused client-side and `400 validation_failed` server-side

#### Scenario: Someone else changed it first
- GIVEN a dialog open on version A, and the ticket saved elsewhere as version B
- WHEN the User saves
- THEN `409 stale_version`, a toast says it was changed by someone else, and the dialog reloads at version B

#### Scenario: Assignee must be active
- WHEN a save names a disabled or unknown User as assignee
- THEN `400 validation_failed` with `assigneeId: ["unknown"]`

### Requirement: Open by link

`GET .../{id}` needs `view-demo-tickets` and answers one ticket (404 for an unknown or malformed id). `?ticket=<id>` on the list opens that ticket's dialog whatever page or filter is showing; closing it removes the parameter. An unknown id shows "no longer exists" in the dialog.

### Requirement: Delete after confirmation

`DELETE .../{id}` needs `manage-demo-tickets` and answers `204` (404 if it is gone). The dialog asks "Delete this demo ticket?" in an alert dialog first; "Keep ticket" changes nothing.

### Requirement: Assignee options

`GET .../assignees` needs `view-demo-tickets` and lists the active Users (name only, no phone), up to 200, for the filter and the dialog.

### Requirement: Permissions and audit

`view-demo-tickets` and `manage-demo-tickets` are in their own group; `manage-demo-tickets` needs `view-demo-tickets` (`422 permission_prerequisites`). Every route checks its key on the server first: `401` without a session, `403` without the key. Four audit events are written in the write transaction, group "Demo tickets": `demo_ticket.created` (title, priority, assignee), `demo_ticket.updated` (`{ old, new }` for the changed title, priority and assignee, and `descriptionChanged`), `demo_ticket.status_changed` (`{ old: { status }, new: { status } }`) and `demo_ticket.deleted` (title, status). A save that changes both fields and the status writes two events; a save that changes nothing writes none. A refused attempt is recorded under the matching operation row in `shared/constants/admin-operations.ts`.

## Image

Media purpose `demo-ticket-image`, gated by `manage-demo-tickets` (`.specs/media/spec.md`). `POST` and `PATCH` take `imageMediaObjectId`, `imageAltFa`, `imageAltEn` (omit to leave, `null` to remove); a row carries `image: { mediaObjectId, key, width, height, altFa, altEn } | null`. The image shows in the edit dialog and as the Cards thumbnail (`/_media` variant), and nowhere else. Replacing or removing leaves the old object for media cleanup; a change writes `imageChanged` into the `demo_ticket.updated` event. With media Off the dialog's image field is disabled with a "storage not configured" hint, thumbnails show a placeholder and create and edit still work. The dev seed gives about a quarter of the tickets a generated image when storage is configured.

## Placement

Every demo path contains `demo-ticket`: `shared/{constants,schemas,utils}/demo-ticket*`, `server/{database/schema,repositories,services}/demo-ticket*`, `server/api/v1/admin/demo-tickets/`, `app/{components,composables}/demo-ticket/`, `app/pages/admin/demo-tickets/`, `i18n/locales/demo-ticket.{en,fa}.json` (feature message files, merged with `en.json` / `fa.json` when the app loads), the migration `0001_demo-tickets`, the dev seed, and the tests. Shared touch-points carry `demo-ticket:start` / `demo-ticket:end` markers: `PERMISSION_KEYS`, `PERMISSION_GROUP_IDS` / `PERMISSION_GROUPS` / `PERMISSION_PREREQUISITES`, `ADMIN_NAV_GROUPS` / `ADMIN_NAV` / `ADMIN_NAV_HUES` (the section hue is 45), `admin-nav-icons.ts`, `AUDIT_GROUPS` / `AUDIT_ACTIONS`, `ADMIN_OPERATIONS`, the schema index, the `db-seed-dev` recipe, and the demo cases of the core nav and catalogue unit tests.

## Dev seed

`just db-seed-dev` (needs `NUXT_APP_ENV=local` and the dev stack) adds 3 dev Users holding `super` and about 40 tickets across every status, priority and assignee, some waiting long. It only fills an empty table, so it never overwrites what was changed in the panel. It is not part of the production seed and no test database path calls it.

## Verification

- `tests/unit/shared/demo-ticket-rules.test.ts`: forward-only transitions, the tones and the waiting-long limits.
- `tests/integration/demo-ticket/demo-tickets.test.ts`: list, create, update, delete, audit events, Zod rejection, `401` and `403` per route and key, stale version, the forward-only rule.
- `tests/integration/demo-ticket/demo-ticket-image*.test.ts`, `demo-ticket-media-gc.test.ts`, `tests/e2e/demo-ticket-image.spec.ts`: the image (see `.specs/media/spec.md`).
- `tests/e2e/demo-tickets-table.spec.ts`: search, filters and paging, create, edit one step and delete behind a confirmation, `?ticket=<id>`, the view-only dialog, axe and the layout direction in `fa` and `en`.
<!-- demo-ticket:end -->
