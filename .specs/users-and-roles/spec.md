# users-and-roles

Living spec. Requirements describe observable outcomes; scenarios are GIVEN / WHEN / THEN. Decisions behind them: the "Access" section of `.specs/decision-log.md`, ADR-0010 (sessions and authorization), ADR-0008 (Zod at the boundary), ADR-0009 (API conventions). Sign-in and sessions are in `.specs/authentication/spec.md`, the frame the pages live in is in `.specs/admin-shell/spec.md`.

This file holds three parts: the **Permission catalogue and Roles** (below, built by the Roles page slice), **Users** (after the Roles part, built by the Users pages slice) and **My account** (last, built by the My account slice). Phase: MVP.

## Purpose

Access to the panel is shaped by Roles. A Permission is a key defined in code; a Role is a named set of Permissions made in the panel; a User holds one or more Roles and may do what the union of their Roles allows. A User with `manage-roles` creates and edits Roles in a two-pane editor that groups Permissions and refuses sets that cannot work. The `super` Role always exists, always holds every Permission and cannot be changed.

## Data

Entities exist since the accounts baseline (`server/database/schema/identity.ts`); this part adds no schema.

- `roles`: `id`, `name` (unique, and unique again on `lower(btrim(name))`), `is_super` (at most one row true), `created_at`, `updated_at`. `updated_at` is the Role's version.
- `permissions`: `key` (primary key), seeded from the catalogue by the production seed, add-only.
- `role_permissions`: `(role_id, permission_key)` primary key; deleting a Role deletes its rows; a database trigger refuses to change the `super` Role's rows.
- `user_roles`: `(user_id, role_id)`; the foreign key to `roles` is `restrict`, so a held Role cannot be deleted.

A Role's Permission set is replaced as a whole on save and written as a difference inside one transaction that first locks the Role row.

## Requirements

### Requirement: Permissions are a code-defined catalogue with groups and prerequisites

The catalogue (`shared/constants/permissions.ts`, `permission-catalog.ts`) has seven keys in three groups: users (`view-users`, `create-users`, `edit-users`, `disable-users`), roles (`view-roles`, `manage-roles`) and audit (`view-audit-log`). Each key has a group, an entry in the prerequisite map (an empty list is a decision) and an `fa`/`en` label and hint under `admin.permissions.*`; the catalogue completeness test fails until all exist. Prerequisites: the user actions need `view-users`; `manage-roles` needs `view-roles`. Permissions are never created or edited in the panel. The next seed run inserts a new key and grants it to `super`; it never removes a key.

#### Scenario: A Project adds a Permission

- **WHEN** a developer adds the key, its group, its prerequisite entry and both labels
- **THEN** the editor offers it in its group, the server accepts it in a Role, and the next seed run grants it to `super`

### Requirement: The Roles list shows Roles with counts

`GET /api/v1/admin/roles` and the page `/admin/roles` MUST list Roles 20 per page, the `super` Role first, then by name ignoring case, then id. Each row has the name, how many Permissions the Role holds (as "n of total"), how many Users hold it and when it was last updated. The search box filters by a contains-match on the name, ignoring case, treating `%` and `_` literally; the search and the page live in the URL. A Role named `super` shows as "Super role" with a badge. Without results the page says so and offers to clear the filter. "New role" shows only to a User holding `manage-roles`. A row opens the Role page.

#### Scenario: Listing

- **GIVEN** the `super` Role and Roles named `zeta`, `Alpha` and `beta`
- **WHEN** a User with `view-roles` opens the list
- **THEN** the rows read Super role, Alpha, beta, zeta, and the `super` row says "7 of 7"

#### Scenario: Searching

- **GIVEN** Roles `Support_team` and `Finance`
- **WHEN** the User searches `_`
- **THEN** only `Support_team` is listed and the URL holds `q=_`

### Requirement: A Role is created and edited in the two-pane Role page

`/admin/roles/new` and `/admin/roles/<id>` MUST show the name field, the Permission editor and, for an existing Role, its members (name and phone, each linking to the User). The Permission editor is two panes: the groups as navigation at inline-start (a scrolling row below `md`), each with an "n/m" count, and the selected group's Permissions as labelled switches with a hint, plus an "Allow all in group" / "Clear group" button. The page tracks unsaved edits: Save is enabled only for a valid change, Reset returns to the stored Role, and leaving with unsaved edits asks first. After a create the Role page opens; after a save the User's own session refreshes at once.

The name is trimmed, 2 to 40 characters, in any script, and unique ignoring case and surrounding spaces (`400 validation_failed` with `name: too_short | too_long`, `409 duplicate_name` on the `name` field). The body names each Permission at most once and only catalogue keys (`unknown`, `duplicate`). A Role may hold no Permission.

#### Scenario: Creating a Role

- **GIVEN** a User with `manage-roles` on `/admin/roles/new`
- **WHEN** they enter "Support", switch on "Edit users" and save
- **THEN** "View users" is switched on with it, the Role is created holding both, and the Role page opens

#### Scenario: A duplicate name

- **GIVEN** a Role "Support"
- **WHEN** a User saves another Role named " support "
- **THEN** the name field says a Role with this name exists, and nothing is stored

#### Scenario: A stale save

- **GIVEN** two Users have the same Role open and the first saves
- **WHEN** the second saves
- **THEN** the answer is `409 stale_version` carrying the Role as it is now, the page reloads it and says it was changed by someone else

#### Scenario: A save that changes nothing

- **WHEN** a User saves a Role with the stored name and Permissions
- **THEN** nothing is written and the Role's version does not move

### Requirement: Prerequisites are enforced in the editor and on the server

Switching a Permission on MUST also switch on everything it needs, directly or through other keys. A Permission another switched-on Permission needs MUST stay on, with its switch disabled and a line naming the Permissions that need it. "Allow all in group" also switches on what the group needs in other groups; "Clear group" keeps any key that a Permission outside the group needs. Independently of the UI, `POST` and `PUT` MUST answer `422 permission_prerequisites` with `missing: [{ key, needs }]` for a set that lacks a prerequisite, and write nothing. The server never adds keys silently.

#### Scenario: Turning on a dependent Permission

- **WHEN** a User switches on "Manage roles"
- **THEN** "View roles" switches on, and its switch is disabled with "Can't turn off: needed by Manage roles"

#### Scenario: A client that skips the editor

- **WHEN** a request saves `["manage-roles"]`
- **THEN** the answer is `422 permission_prerequisites` listing `{ key: "manage-roles", needs: "view-roles" }`

### Requirement: Only a super User acts on `super`, and nobody changes it

The `super` Role MUST show every switch on and disabled, its name unchangeable and no Save, Reset or Delete, with a note that it always holds every Permission. In the service, `PUT` or `DELETE` on the `super` Role answers `403 super_required` to an actor who does not hold `super` and `409 super_role_protected` to one who does; nothing is written either way. The database refuses any rename, `is_super` change, deletion or change to its Permission rows too. Reading it is open to `view-roles`. No Role can be named like `super` (`409 duplicate_name`).

#### Scenario: A non-super User tries to reduce `super`

- **GIVEN** a User holding `manage-roles` but not `super`
- **WHEN** they `PUT` the `super` Role with fewer Permissions
- **THEN** the answer is `403 super_required` and the Role is unchanged

#### Scenario: A super User tries the same

- **GIVEN** a User holding `super`
- **WHEN** they `PUT` or `DELETE` the `super` Role
- **THEN** the answer is `409 super_role_protected` and the Role is unchanged

### Requirement: A Role in use is not deleted

`DELETE /api/v1/admin/roles/<id>?expectedUpdatedAt=…` MUST delete a Role that no User holds, with its Permission rows, after a confirm in the page. While any User holds it the answer is `409 in_use` with the member count, and the page says how many Users hold it. A holder added while the request runs still makes the foreign key refuse it. An old version answers `409 stale_version`, an unknown id `404`.

#### Scenario: Deleting a held Role

- **GIVEN** a Role held by two Users
- **WHEN** a User confirms its deletion
- **THEN** the Role stays and the page says "Can't delete: 2 users hold this role. Remove it from them first."

### Requirement: Editing your own access asks first

The Role page MUST know whether the User holds the Role and which of its Permissions they hold through no other Role. Saving a held Role that would remove such a Permission MUST first ask "Remove your own access?" listing what would be lost, with "Keep editing" and "Save anyway".

#### Scenario: Removing your own `manage-roles`

- **GIVEN** a User whose only source of `manage-roles` is the Role they edit
- **WHEN** they switch it off and save
- **THEN** the dialog lists "Manage roles"; "Keep editing" saves nothing, "Save anyway" saves and the page becomes read-only

### Requirement: Role changes take effect by the next request

A change to a Role's Permissions applies to every holder at their next server request, without ending any session (the gate reads Permissions per request).

### Requirement: The Roles routes check the Permission on the server

Every route MUST call its guard before anything else: `GET` list and `GET` one need `view-roles`; `POST`, `PUT` and `DELETE` need `manage-roles`; `GET /api/v1/admin/options/roles` (every Role, lean, with whether the asker is super; for pickers and the Users filter) needs `view-users` or `view-roles`. Without a session the answer is `401 unauthenticated`; with a session lacking the key `403 forbidden`. A malformed id is `404`. The pages `/admin/roles` and `/admin/roles/<id>` need `view-roles`, `/admin/roles/new` needs `manage-roles`; without it the page answers 403 and the menu has no entry. A User with `view-roles` only sees every Role page read-only, with a note. A read or write that comes back 403 while the page is open shows the "Access denied" alert in place.

#### Scenario: A viewer cannot write

- **GIVEN** a User holding `view-roles` only
- **WHEN** they `POST` a Role
- **THEN** the answer is `403 forbidden`, and the Role page shows disabled switches with "You can view roles but not change them."

### Requirement: The Roles pages are accessible, in both locales and directions

The list, the Role page (including the `super` Role and the dialogs) MUST have no axe violations (WCAG 2 A/AA and 2.1 A/AA) in `fa` and `en`, render right-to-left in `fa` and left-to-right in `en` with logical properties, and work on a phone, where the group navigation becomes a scrolling row.

## Constitution check

- II (authenticated): every Roles route and page needs a session and a Permission.
- IV (security): Zod on every body, query and id; the server decides, the UI only mirrors; parameterized queries; the `super` Role is protected in the service and in the database.
- VI (data models first): no new tables; the columns and invariants used are listed under Data.
- VIII (Vue Query): the pages read and write through `useAdminRoles`; the Role page keeps the edited copy in the page and does not mirror remote data into Pinia.

## Assumptions

- Role create, change and delete leave no audit events yet; the audit slice adds `role.create`, `role.update` (name before/after, added and removed keys) and `role.delete` inside the service transactions.
- Roles are given to Users from the Users pages (see **Users** below); the member links on the Role page open the User page.
- The list has a Table view only; the Cards view of ADR-0027 is adopted when the list views slice ships `AdminCardList`.
- Persian copy under `admin.roles` is a draft until the owner approves it (`i18n/unapproved.md`).

## Users

### Purpose

A User with the right Permissions lists the people who can sign in, creates a User with at least one Role, corrects their names, changes the Roles they hold and, to offboard them, disables them. There is one kind of account: no Shopper or Admin type, badge or filter, and no promote or demote action. Nobody acts on their own account, and the Default admin is never disabled and never loses `super`.

### Data

No new schema: the `users`, `user_roles` and `auth_sessions` tables of the accounts baseline (see **Data** above and `server/database/schema/identity.ts`).

- `users.updated_at` is the User's version. Every change to the account (names, Roles, status) moves it once; a request that changes nothing does not. Every write names the version it was loaded at (`expectedUpdatedAt`).
- `users.status` is `active` or `disabled`; a database check keeps the Default admin (`is_default_admin`, at most one row) from being `disabled`.
- Accounts are never deleted. A phone is unique and belongs to its owner, who changes it from My account.
- Creating a User inserts the account (no verified phone: that is set at their first sign-in) and their `user_roles` rows (with `assigned_by`) in one transaction; disabling sets the status and revokes every session of the account in one transaction.

### Requirement: The Users list shows every account, newest first

`GET /api/v1/admin/users` and the page `/admin/users` MUST list Users 20 per page, newest first, then by id. Each row has the name (or "No name"), the phone (left to right), the Roles (the first two, then "+n"), the status, when they joined and when they were last active (or "Never signed in"), with "You" and "Default admin" marks. The search box is one field: an Iranian mobile number in any form is an exact phone match; anything else is a contains-match on the given and family names ignoring case, Persian and Arabic letter and digit variants and zero-width non-joiners, treating `%` and `_` literally. A Status filter (all, active, disabled) and a Role filter (every Role) narrow the list. The search, the filters and the page live in the URL; an unknown value is dropped. Without results the page says so and offers to clear the filters. "New user" shows only to a User holding `create-users` and `manage-roles`. A row opens the User page.

#### Scenario: Searching by phone and by name

- **GIVEN** a User named "Nia Rahimi" with phone `+989120000211`
- **WHEN** a User with `view-users` searches `0912 000 0211`, then `RAHI`
- **THEN** both searches list only that User, and the URL holds `q`

#### Scenario: Filtering

- **GIVEN** an active User holding the Role "Support" and a disabled User holding no such Role
- **WHEN** the list is filtered by that Role, then by status Disabled
- **THEN** the first filter lists the active User, the second the disabled one, and "Clear filters" returns to the full list

### Requirement: A User is created with at least one Role

`POST /api/v1/admin/users` MUST need `create-users` and `manage-roles` together and answer `201` with the new User. The body is the phone (any form of an Iranian mobile number, stored as `+989XXXXXXXXX`), both names or neither (1 to 50 characters each, as in My account) and `roleIds`, at least one existing Role (`400 validation_failed`: `phone: invalid | required`, `givenName | familyName: required`, `roleIds: required | unknown`, any other key refused). Granting `super` needs a super actor (`403 super_required`). A phone that is already registered answers `409 phone_in_use` naming that account, and the dialog offers to open it. No code or SMS is sent; the person signs in with the number as for any account.

#### Scenario: Creating a User

- **GIVEN** a User holding `create-users` and `manage-roles`, and a Role "Support"
- **WHEN** they create a User with phone `0912 000 0211`, names "Nia" and "Rahimi" and the Role "Support"
- **THEN** the answer is `201`, the User page opens, the account has no verified phone yet and holds only "Support"

#### Scenario: Without a Role

- **WHEN** the dialog is submitted with no Role chosen, or `roleIds` is empty
- **THEN** the dialog says "Choose at least one role." and the API answers `400 validation_failed` with `roleIds: ["required"]`; nothing is created

#### Scenario: A phone already registered

- **GIVEN** a User with phone `+989120000201`
- **WHEN** someone creates a User with `0912 000 0201`
- **THEN** the answer is `409 phone_in_use` with that User's id, and the dialog says "A user with this number already exists." with "Open that account"

### Requirement: The User page shows the account and its actions

`GET /api/v1/admin/users/<id>` (`view-users`) and the page `/admin/users/<id>` MUST show the names, phone, status, joined and last-active times, how many sessions are live, and the Roles; the answer also says whether the asking User holds `super`. An unknown or malformed id is `404` and the page says "User not found". Actions are dialogs: "Edit names" needs `edit-users`; "Edit roles" needs `edit-users` and `manage-roles`; "Disable user" and "Enable user" need `disable-users`. The page shows only the actions the rules allow: none that change the Roles or the status of the User's own account, none on a User who holds `super` unless the viewer is super, and no disable on the Default admin. The server decides again on every request. After an action succeeds a toast shows and the page reloads the account.

#### Scenario: Your own page

- **GIVEN** a User with every Users Permission
- **WHEN** they open their own User page
- **THEN** it is marked "You", offers "Edit names" and neither "Disable user" nor "Edit roles"

### Requirement: Names are edited with the My account rules

`PATCH /api/v1/admin/users/<id>` (`edit-users`) MUST take both names (trimmed, inner spaces collapsed, 1 to 50 characters, no control characters, any script) and `expectedUpdatedAt`, and nothing else (a stray `phone` is `400`). It works on any account, one's own and the Default admin's included. The phone is changed only by its owner, from My account. A save that changes nothing writes nothing and moves no version.

#### Scenario: Renaming

- **WHEN** a User with `edit-users` saves "Nina" for the given name of "Nia Rahimi"
- **THEN** the User is "Nina Rahimi", the version moved, and saving the same names again leaves the version as it was

### Requirement: Roles are replaced as a whole set

`PUT /api/v1/admin/users/<id>/roles` MUST need `edit-users` and `manage-roles` and take `roleIds` (at least one, capped, de-duplicated) and `expectedUpdatedAt`. It adds and removes only the difference inside one transaction that locks the account and share-locks the Roles, and sessions stay valid: the next request reads the new Roles. A User never ends up with no Role. A Role removed meanwhile is `400` with `roleIds: ["unknown"]`.

#### Scenario: Changing Roles

- **GIVEN** a User holding "Support"
- **WHEN** a User with both Permissions sets their Roles to "Spare"
- **THEN** the User holds only "Spare", and an old tab that still shows "Support" gets `409 stale_version` when it saves

### Requirement: Disabling ends access at once; enabling restores it

`POST .../disable` and `.../enable` (`disable-users`) MUST take `expectedUpdatedAt`. Disabling sets the status `disabled` and revokes every session of the account (reason `account_disabled`) in the same transaction, so their next request is `401` and they cannot sign in; their Roles are kept. Enabling sets `active` and restores no session: the person signs in again. Disabling a disabled account or enabling an active one is `409 invalid_transition`. The page asks first ("Disable <name>?").

#### Scenario: Offboarding

- **GIVEN** a signed-in User with a live session
- **WHEN** a User with `disable-users` disables them
- **THEN** the status is `disabled`, the session count is 0, the revoked session has reason `account_disabled`, and the person's next request answers `401`

### Requirement: Nobody acts on their own account

Disabling, enabling or changing the Roles of one's own account MUST answer `403 own_account`, for every actor including a super User, and the page offers none of these on it. Editing one's own names through this API is allowed (My account is the usual way).

#### Scenario: Disabling yourself

- **WHEN** a User with `disable-users` posts a disable for their own id
- **THEN** the answer is `403 own_account` and the account stays active

### Requirement: The Default admin is never disabled and never loses `super`

Disabling the Default admin, by anyone, MUST answer `409 default_admin_protected`; so MUST a Roles save for it that leaves out the `super` Role (a save that keeps `super` and adds other Roles is allowed). The Roles dialog keeps `super` switched on for them. A database check also refuses `disabled` for the Default admin.

#### Scenario: Trying to lock the panel

- **GIVEN** the Default admin and a super User
- **WHEN** the super User disables the Default admin, or sets their Roles without `super`
- **THEN** each answers `409 default_admin_protected` and nothing changes

### Requirement: Only a super User grants `super` or acts on a User who holds it

An actor without `super` MUST get `403 super_required` when creating a User with, granting, or removing the `super` Role, and when disabling, enabling or re-roling a User who holds it. The Role pickers offer the `super` Role only to a super viewer.

#### Scenario: A non-super manager

- **GIVEN** a User with every Users Permission but not `super`
- **WHEN** they disable a super User, give anyone `super`, or create a User with `super`
- **THEN** each answers `403 super_required` and nothing changes

### Requirement: The Users routes check the Permission on the server

Every route MUST call its guard before anything else: `GET` list and `GET` one need `view-users`; `POST` needs `create-users` and `manage-roles`; `PATCH` needs `edit-users`; `PUT .../roles` needs `edit-users` and `manage-roles`; `POST .../disable` and `.../enable` need `disable-users`. Without a session the answer is `401 unauthenticated`; with a session missing any one of the keys `403 forbidden`. The page `/admin/users` and `/admin/users/<id>` need `view-users`; without it the page answers 403 and the menu has no entry. A read or write that comes back 403 while the page is open shows the "Access denied" alert in place.

#### Scenario: Part of the keys is not enough

- **GIVEN** a User holding `view-users` and `create-users` but not `manage-roles`
- **WHEN** they `POST` a User
- **THEN** the answer is `403 forbidden` and "New user" is not on their list page

### Requirement: The Users pages are accessible, in both locales and directions

The list, the User page and the create and roles dialogs MUST have no axe violations (WCAG 2 A/AA and 2.1 A/AA) in `fa` and `en`, render right-to-left in `fa` and left-to-right in `en` with logical properties, keep phone numbers left to right, and not scroll sideways on a phone. Destructive confirms use the outline button with destructive text, which keeps contrast.

### Constitution check

- II (authenticated): every Users route and page needs a session and a Permission.
- IV (security): Zod on every body, query and id; the server decides, the UI only mirrors; parameterized queries; the Default admin and `super` rules are checked in the service on the locked row; disabling revokes sessions in the same transaction.
- VI (data models first): no new tables; the columns and invariants used are listed under Data.
- VIII (Vue Query): the pages read and write through `useAdminUsers`; dialogs keep their typed values locally and the page refetches after a write, not mirroring remote data into Pinia.

### Assumptions

- User create, edit, Role change, disable and enable leave no audit events yet; the audit slice adds `user.create`, `user.update` (which fields changed), `user.roles` (added and removed Role ids), `user.disable` and `user.enable` inside the same service transactions (`server/services/admin-users.service.ts`). Disable and enable take no reason until then; the audit slice decides whether to add one.
- Re-enabling is included so an offboarding mistake is reversible; the decision log names only disabling.
- Editing a User's Roles needs `edit-users` as well as `manage-roles` (the Roles dialog is part of editing a User); creating needs `create-users` and `manage-roles`.
- Names are editable by any User with `edit-users`, including on a `super` account; the phone is not editable here.
- The Analytics strip above the list (story 86) belongs to the dashboard framework slice; the list has none yet.
- The list has a Table view only (as Roles).
- Persian copy under `admin.users` is a draft until the owner approves it (`i18n/unapproved.md`).

## My account

### Purpose

Any signed-in User keeps their own details current without an administrator: they edit their name and change the phone they sign in with. The page is in the user menu, has no page Permission and works only on the signed-in User's own account.

### Requirement: My account is open to every signed-in User

My account MUST be an entry of the user menu (`ADMIN_USER_MENU_LINKS`, page `/admin/account`, `/en/admin/account`) beside the other account entries. It MUST declare no page Permission. Its API (`GET` and `PATCH /api/v1/admin/account`, `POST /api/v1/admin/account/phone-change/request` and `.../verify`) MUST answer `401 unauthenticated` to a guest before reading anything, and MUST always act on the session's own account, never on an id from the client. Every answer is `private, no-store`.

#### Scenario: A User holding no Permission opens it

- **GIVEN** a signed-in User whose Roles grant no Permission
- **WHEN** they choose "My account" in the user menu
- **THEN** the page opens with their names and their phone, and no Access denied page appears

#### Scenario: A guest calls the API

- **WHEN** a request without a valid session calls any of the four endpoints
- **THEN** the response is `401 unauthenticated`

### Requirement: A User edits their own name

The form MUST hold a given name and a family name, each trimmed, with inner whitespace collapsed to single spaces, 1 to 50 characters (counted as characters) and without control characters. Any script is allowed. Save MUST stay disabled until both names are valid and differ from what is saved. An error MUST show under a field only after the field was left, or when the server names it. `PATCH` MUST take exactly the two names and refuse any other key. After a save the user menu shows the new name without a reload.

#### Scenario: Saving a name

- **GIVEN** a User on My account
- **WHEN** they enter `  سارا ` and `احمدی   نیا` and save
- **THEN** the saved names are `سارا` and `احمدی نیا`, a "saved" toast shows, Save is disabled again and the user menu shows the new name

#### Scenario: An empty name

- **WHEN** a name is empty or only spaces
- **THEN** the field shows "This field is required." after it is left, Save stays disabled, and the API answers `400 validation_failed` with `givenName: ["required"]`

#### Scenario: A stray key

- **WHEN** `PATCH` carries `phone` besides the names
- **THEN** the response is `400 validation_failed` and nothing changes

### Requirement: A User changes their phone through a code sent to the new number

The phone is shown read-only with a Change action that opens a dialog. Step one takes the new number (normalized like sign-in); step two takes the five-digit code sent to it. The number MUST change only on the server, after a correct code. The code, its two-minute life, ten attempts and 30-second resend behave as in sign-in; the challenge has purpose `phone_change`, belongs to the requesting User and is the only live phone-change challenge of that User. Sends count in the per-phone and per-IP limits of sign-in and in a cap of 5 sends per User per hour; they go through the same `SmsProvider` seam, and `testCode` is returned only where sign-in returns it.

- The User's own number MUST be refused as soon as it is typed and by the server (`400 validation_failed`, `phone: ["current_phone"]`).
- The request step MUST answer the same for a registered, an unregistered and a disabled number. A number that belongs to another account is reported only when verifying, after a correct code, as `409 phone_in_use` that names no account; the challenge is then closed and the User keeps their number.
- A challenge asked for by another User is none of the caller's business: verifying it answers `422 otp_expired` and costs it no attempt.
- On success, in one transaction: the phone is replaced and marked verified, the challenge is consumed (its code cleared), and every other session of the User is revoked; the session that made the change stays signed in.
- Closing the dialog discards what was typed; the next opening starts again.

#### Scenario: Changing the phone

- **GIVEN** a User with phone `+989120000011` and a second session on another device
- **WHEN** they request a code for `0912 000 0012`, then submit the code
- **THEN** the code was sent to the new number only, the account's phone is `+989120000012`, the code is cleared from the database, the other session is revoked with reason `phone_changed`, and this session is still signed in

#### Scenario: The current number

- **WHEN** a User enters their own number
- **THEN** the dialog says "This is already your number", sending is disabled, and the API refuses it without sending an SMS

#### Scenario: A wrong code

- **GIVEN** a code was requested for a new number
- **WHEN** the User submits a wrong code
- **THEN** the response is `422 otp_incorrect`, the dialog shows the wrong-code message, the phone is unchanged, and the right code still works

#### Scenario: The number belongs to another account

- **GIVEN** another account holds `+989120000013`
- **WHEN** the User requests a code for it and then submits the right code
- **THEN** the request answered like for any other number; verifying answers `409 phone_in_use`, the dialog says the number belongs to another account, and the User's phone is unchanged

#### Scenario: Someone else's code

- **GIVEN** User A requested a code for a new number
- **WHEN** User B submits that number and code
- **THEN** the response is `422 otp_expired` and A's challenge is untouched

### Requirement: My account works in both languages and handles load failure

The page MUST render in Persian (RTL, Persian digits) and English (LTR), keep the phone digits left-to-right, show a skeleton while the account loads and an inline alert with Retry when it cannot be read, with the shell staying usable. It MUST pass the automated accessibility scan in both languages, with the dialog closed and open.

#### Scenario: The account cannot be read

- **WHEN** `GET /api/v1/admin/account` fails
- **THEN** the content area shows "We couldn't load your account." with Retry, the sidebar and header stay, and Retry loads the form

### Constitution check

- II (everything authenticated except landing and sign-in): the page is under `/admin/**`; the API guards itself with `requireSignedIn`.
- VII (security): Zod at the boundary; origin CSRF; no account enumeration on the request step; the code is cleared once used; rate limits server-side; the body, number and code are never logged.
- No new schema: the flow reuses `otp_challenges` and `otp_send_events` (purpose `phone_change`, nullable `user_id`).

### Assumptions

- Persian copy is a draft until the owner approves it (`i18n/unapproved.md`).
- A User with a Telegram subscription keeps it when the phone changes until the Telegram Optional piece lands; that piece decides whether a phone change ends it (the Source behavior did), and adds the notice and the audit row then.
- The change is not written to the audit log until the audit slice defines phone-change actions.

