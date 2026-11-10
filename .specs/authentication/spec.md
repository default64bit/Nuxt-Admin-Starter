# authentication

Living spec. Requirements describe observable outcomes; scenarios are GIVEN / WHEN / THEN. Decisions behind them: ADR-0010 (sessions, one-time codes), ADR-0013 (private pages), ADR-0021 (the `SmsProvider` seam), ADR-0023 (CSRF by request origin) and `.specs/decision-log.md`. Users, Roles and Permissions are in `.specs/users-and-roles/spec.md`.

## Purpose

A User signs in to the admin panel with a phone number and a one-time code sent by SMS. There are no passwords and no other sign-in methods. Sessions are server-side records behind a protected cookie, so they can be ended at any time. Sign-in never creates an account and never reveals whether a phone number has one.

## Requirements

### Requirement: Phone and one-time code are the only sign-in

Sign-in MUST use a phone number and a five-digit numeric code sent by SMS through the `SmsProvider` seam. The code MUST come from a cryptographically secure generator and MAY start with zero; that leading zero is kept when it is sent and checked.

#### Scenario: A User signs in

- **GIVEN** an active User whose phone is `+989120000001`
- **WHEN** they request a code for `09120000001` and then submit the code they received
- **THEN** they are signed in, the response is the session payload, and a session cookie is set

#### Scenario: The code has a leading zero

- **WHEN** the generator produces `7`
- **THEN** the code sent and checked is `00007`

### Requirement: Phone numbers are normalized before use

The browser and the server MUST use one normalizer. `09XXXXXXXXX`, `9XXXXXXXXX`, `989XXXXXXXXX`, `+989XXXXXXXXX` and `00989XXXXXXXXX`, in Latin, Persian or Arabic-Indic digits and with spaces, dashes, dots or brackets between digits, all become `+989XXXXXXXXX` before lookup, challenge and rate limiting. Anything else is `400 validation_failed`. The code accepts the same digit scripts and spaces and dashes.

#### Scenario: Two spellings of one number

- **WHEN** `0912 000 0000` and `+989120000000` request codes
- **THEN** both resolve to the same phone, the same challenge and the same rate-limit bucket

### Requirement: Unknown, disabled and known phones are indistinguishable

`POST /api/v1/auth/otp/request` MUST answer a known phone, an unknown phone and a disabled account with the same status and the same body shape, and MUST NOT create an account. An SMS is sent only to an active account; for the others the request takes the identical path (a challenge, a counted send, the same response) with the provider call skipped. Verifying a correct code for a phone without an active account MUST fail with the ordinary `otp_incorrect`, not a status-revealing code.

#### Scenario: Unknown phone requests a code

- **GIVEN** no User has `+989120000002`
- **WHEN** that phone requests a code
- **THEN** the response is `200` with the same keys as for a known phone, no SMS is sent, and no User exists afterwards

#### Scenario: Unknown phone submits the code

- **GIVEN** the previous scenario
- **WHEN** the correct code is submitted for that phone
- **THEN** the answer is `422 otp_incorrect`, no cookie is set, and no User or session exists

#### Scenario: Disabled account

- **GIVEN** a disabled User
- **WHEN** they request a code and submit it
- **THEN** the request answers `200`, no SMS is sent, and the code is answered `otp_incorrect`

### Requirement: A code lives two minutes, allows ten attempts and can be resent

A code MUST expire 2 minutes after it was issued. At most 10 attempts are allowed; the tenth wrong attempt invalidates the code, after which even the right code is `otp_expired`. A request before expiry MUST send the same code again without extending its life. An SMS can be requested only every 30 seconds, measured from the last actual send for that phone.

#### Scenario: Resend inside the window

- **GIVEN** a code sent 40 seconds ago
- **WHEN** the phone requests again
- **THEN** the same code is sent, `expiresIn` is 80, `resendIn` is 30, and one more send event exists

#### Scenario: Request too soon

- **GIVEN** a code sent 29 seconds ago
- **WHEN** the phone requests again
- **THEN** the answer is `429 otp_resend_too_soon` with `retryAfter` 1 and no SMS is sent

#### Scenario: Tenth wrong code

- **GIVEN** nine wrong codes were submitted
- **WHEN** a tenth wrong code is submitted
- **THEN** the answer is `422 otp_attempts_exceeded`, the code is cleared, and a correct code now answers `otp_expired`

#### Scenario: Code entered late

- **WHEN** a code is submitted more than 2 minutes after it was issued
- **THEN** the answer is `422 otp_expired`

### Requirement: Sends are limited per phone and per IP

Rolling windows count every actual SMS send, resends included: at most 5 per phone per hour, 10 per phone per day, 30 per IP per hour and 100 per IP per day. A limited request sends nothing and answers `429 otp_rate_limited` with `retryAfter` (also the `Retry-After` header). Limits never block permanently; they lift as the oldest counted send ages out. Only an HMAC of the IP (keyed by `NUXT_IP_HASH_SECRET`) is stored. The coarse per-IP route limiter additionally covers `/api/v1/auth/otp/**`. CAPTCHA is not used. A failed provider send is not counted and does not move the last-sent time.

#### Scenario: Sixth send in an hour

- **GIVEN** five sends to one phone in the last hour
- **WHEN** it requests again
- **THEN** the answer is `429 otp_rate_limited`, no SMS is sent, and the request succeeds once the oldest send is an hour old

#### Scenario: Provider failure

- **WHEN** the SMS provider fails or throws during a request
- **THEN** the answer is `503 sms_unavailable`, no send event is written, and an immediate retry is allowed

### Requirement: The code is kept only while it is active

The active code MUST be stored in plaintext in its challenge (so a resend can repeat it) and cleared when it is used, expires or is invalidated. It MUST NOT appear in logs, audit records, error tracking, payloads or client-readable state. Expired codes still stored are cleared by an hourly housekeeping pass, which also deletes send events and ended sessions older than a day.

#### Scenario: Code used

- **WHEN** a code is accepted
- **THEN** its challenge is consumed and its stored code is empty

### Requirement: Test code only for the mock adapter in local and test

When the effective SMS provider is `mock` and `NUXT_APP_ENV` is `local` or `test`, `otp/request` MUST also return the code as `testCode`, and the sign-in form fills the boxes and shows a test-mode notice. In every other combination the response has no `testCode`. An unset or blank `NUXT_SMS_PROVIDER` means `mock` in `local` and `test` and `disabled` elsewhere. The code is never submitted automatically.

#### Scenario: No test code in staging

- **GIVEN** `NUXT_APP_ENV=staging` with the mock adapter
- **WHEN** a code is requested
- **THEN** the response has no `testCode`

### Requirement: SMS goes through one OTP-only seam

Sending a code MUST go through the `SmsProvider` interface (`sendOtp`); application code MUST NOT call a vendor directly. The seam serves the sign-in code only. Adapters: `mock` (default in `local` and `test`, accepts everything, logs only the locale), `disabled`, and `kavenegar` (shipped, off). The Kavenegar adapter uses `verify/lookup` and needs `NUXT_KAVENEGAR_API_KEY` plus the two template slots `NUXT_SMS_TEMPLATE_OTP_FA` and `NUXT_SMS_TEMPLATE_OTP_EN` (an empty English slot sends the Persian template); there are no other template slots. Its failures are short categories only, never provider text, the API key or the code. In `production`, `disabled` and `mock` are refused unless `NUXT_SMS_ALLOW_MOCK_IN_PRODUCTION=true` explicitly allows `mock`; a provider that cannot be resolved answers `503 sms_unavailable` and startup logs why.

#### Scenario: Adapter chosen by configuration

- **WHEN** `NUXT_SMS_PROVIDER=kavenegar` with a key and a Persian template
- **THEN** a code is sent through Kavenegar and a failure is reported only as a category such as `kavenegar_401`

### Requirement: Sessions are revocable server-side records

A successful verification MUST insert a session record (only the SHA-256 hash of an opaque token is stored) and set a sealed cookie holding only `{ secure: { token }, user: { id } }`. The cookie is `httpOnly`, `sameSite=lax` and `Secure` on every HTTPS deployment (off only for `local` or `test` over plain `http`); its `Max-Age` is the time left until the session's absolute expiry. Every authenticated request MUST be judged against the database: revocation, idle expiry, absolute expiry, the account being active, and the User's current Roles and Permissions (so a change applies on the next request). Verifying while signed in revokes this browser's current session and issues a new one; other devices stay signed in. A guest request never receives a session cookie.

#### Scenario: Session cookie issued

- **WHEN** a code is accepted
- **THEN** the cookie is `httpOnly` with `SameSite=Lax`, and an active session record exists

### Requirement: Sessions end after 30 minutes idle or 12 hours in total

One policy applies to every User: a session ends after 30 minutes without a request or 12 hours after it was created, whichever comes first. A valid request extends the idle window, written at most once per 60 seconds per session. Disabling a User ends all their sessions.

#### Scenario: Idle limit

- **GIVEN** a session whose last request was 31 minutes ago
- **WHEN** it is used
- **THEN** it counts as no session

#### Scenario: Absolute limit

- **GIVEN** a session created 12 hours and 1 minute ago that was active a minute ago
- **WHEN** it is used
- **THEN** it counts as no session

#### Scenario: Activity writes are throttled

- **WHEN** a session makes ten valid requests within one minute
- **THEN** its idle time is written at most once

#### Scenario: Account disabled

- **GIVEN** a signed-in User
- **WHEN** their account is disabled
- **THEN** their next request is treated as signed out

### Requirement: The browser learns the session from one endpoint

`GET /api/v1/auth/session` MUST always answer `200`, `private, no-store`: `{ loggedIn: false }` for a guest or an ended session, otherwise `{ loggedIn: true, user: { givenName, familyName, permissions } }`. It MUST NOT contain an id, phone, status or role list; Permissions are for UX gating only and the server stays authoritative. The module's own `/api/_auth/session` routes answer `404`. `POST /api/v1/auth/logout` revokes only the current session, clears the cookie and answers `204` even for a guest.

#### Scenario: Sign-out revokes one session

- **GIVEN** two sessions of one User
- **WHEN** one signs out
- **THEN** that cookie no longer works and the other session stays valid

### Requirement: Every page except landing and sign-in requires sign-in

Every page in the private page table (all of `/admin/**` and its `/en` mirror) MUST be reachable only with a valid session; a guest is answered `302` to `/sign-in?redirect=<path>` (or `/en/sign-in`). Every `/api/v1` route other than sign-in, the session read and logout MUST answer `401 unauthenticated` without a session. The landing page never reads the session and stays shared-cached. A signed-in visitor opening sign-in is redirected to the validated `redirect`, or to the admin home. In-app navigation to a private page without a session goes to sign-in too, and a `401 unauthenticated` from any `/api/v1` call flips the app to the guest state and sends the person to sign-in.

#### Scenario: Guest opens an admin page

- **WHEN** a guest requests `/admin/users`
- **THEN** the response is `302` to `/sign-in?redirect=%2Fadmin%2Fusers`

#### Scenario: Landing page stays public

- **WHEN** a guest requests `/`
- **THEN** the response is `200`, identical for every visitor

### Requirement: A return path is safe

`redirect` MUST be a same-origin path with a single leading `/`: no scheme, no `//`, no backslash, no control characters (also after percent-decoding), and never sign-in itself. Anything else falls back to the admin home.

#### Scenario: Open-redirect attempt

- **WHEN** `redirect` is `//evil.example`, `https://evil.example` or `/\evil`
- **THEN** after signing in the person lands on the admin home

### Requirement: An ended session says so on sign-in

When a request carries a session that no longer holds (idle limit, absolute limit, signed out elsewhere, account disabled), the person MUST be sent to sign-in with a clear message that the session ended and why, and the page they wanted is kept as `redirect`. The stale cookie is cleared.

#### Scenario: Idle session opens an admin page

- **GIVEN** a session idle for 31 minutes
- **WHEN** its cookie requests `/admin`
- **THEN** the response is `302` to `/sign-in?redirect=%2Fadmin&reason=session-ended` and the page shows "Your session has ended" in the active language

### Requirement: The sign-in page

The sign-in page MUST be an uncached, noindex page in the default layout with a phone step and a code step. The phone field is `type="tel"`, `inputmode="tel"`, `autocomplete="tel-national"` and `dir="ltr"` in both languages and shows the locale's digits. The code step shows five left-to-right boxes (`autocomplete="one-time-code"`, `inputmode="numeric"`), accepts pasted Persian, Arabic-Indic and Latin digits, and offers resend (disabled with a countdown), "use a different number", and "send a new code" after expiry or too many attempts. Every state is shown inline, never as a toast: invalid number (after submit or blur, not while typing), sending and verifying (inputs read-only, form `aria-busy`), wrong code (boxes clear, focus returns to the first, announced), rate limited, provider or network failure (the typed code is kept on a network failure), and a generic error with a reload action. Within the two-minute window, closing or reloading the tab resumes the code step; the code itself is never stored. Signing out shows a "signed out" toast on the next page.

#### Scenario: Persian digits typed

- **WHEN** a visitor types `۰۹۱۲ ۵۵۵ ۰۱۲۳` in the Persian page
- **THEN** the field shows Persian digits and the request is for `+989125550123`

#### Scenario: Wrong code

- **WHEN** a wrong code is submitted
- **THEN** the boxes clear, focus is on the first box, the error is announced, and it clears on the next keystroke

#### Scenario: Reload during the code step

- **GIVEN** a code was requested 50 seconds ago
- **WHEN** the visitor reloads
- **THEN** the code step shows with the resend countdown running

### Requirement: Auth responses are never shared-cached and are guarded against cross-site posts

Everything under `/api/v1/auth/**` and `/api/_auth/**` is `private, no-store`. State-changing requests are protected by the request-origin check (ADR-0023). Failures use the standard error body; the codes are `validation_failed` (400), `otp_resend_too_soon` and `otp_rate_limited` (429, with `retryAfter`), `otp_incorrect`, `otp_expired` and `otp_attempts_exceeded` (422, never 401, so a global "401 means session ended" handler never fires on sign-in failures), `sms_unavailable` (503) and `csrf_rejected` (403). The server sends no localized text.

#### Scenario: Cross-site post

- **WHEN** a request with `Sec-Fetch-Site: cross-site` posts to `/api/v1/auth/otp/request`
- **THEN** the response is `403 csrf_rejected` and no SMS is sent

## Constitution check

- II (everything authenticated except landing and sign-in): the private page table plus the server route guard, the client navigation guard and the `401` rule.
- VII (security): secure, `httpOnly` cookies; opaque tokens stored as hashes; origin CSRF; Zod at the boundary; rate limits server-side; no account enumeration; secrets only from the environment.
- No new account type: sign-in never registers a phone.

## Assumptions

- Persian copy for the sign-in page is a draft until the owner approves it (`i18n/unapproved.md`).
- A small timing difference between active and other accounts (the skipped provider call) is accepted.
- Phone change from My account reuses `otp_challenges` (purpose `phone_change`) and `otp_send_events` and arrives with the My account page.
