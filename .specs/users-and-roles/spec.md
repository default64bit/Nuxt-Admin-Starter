# users-and-roles

Living spec. Requirements describe observable outcomes; scenarios are GIVEN / WHEN / THEN. Decisions behind them: `.specs/decision-log.md`, ADR-0010 (sessions, one-time codes) and ADR-0021 (the `SmsProvider` seam). Sign-in and the session policy are in `.specs/authentication/spec.md`; the frame around the pages is in `.specs/admin-shell/spec.md`.

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

