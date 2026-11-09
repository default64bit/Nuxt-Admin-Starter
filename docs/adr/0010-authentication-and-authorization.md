# ADR-0010: Authentication and authorization

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

The admin panel signs Users in with a phone number and a one-time code. It needs short session lifetimes, immediate revocation when an account is disabled, permission changes that take effect on the next request, and server-enforced authorization. A secured cookie alone cannot provide reliable server-side revocation and activity tracking without checking authoritative server state.

## Decision

### Sessions

- Use `nuxt-auth-utils` for sealed session cookies and cookie helpers. Authentication is phone plus OTP only; there are no passwords, password hashing or reset flows.
- Persist a server-side session registry in PostgreSQL. The cookie holds only `{ secure: { token }, user: { id } }`, with `cookie.maxAge` set per session from its absolute expiry. The registry stores creation time, last activity, revocation status and the user reference.
- On every authenticated request, validate the session record and the User's current enabled state. Enforce idle and absolute expiry: **30 minutes idle and 12 hours absolute, for every User**. Activity writes are throttled to once per 60 seconds per session.
- Logout (POST, 204, idempotent) revokes the current session and clears the cookie. Disabling an account revokes all of its sessions. Accounts are never deleted; offboarding means disabling. Verifying a code while signed in revokes the browser's current session and issues a fresh one.
- Cookies are `httpOnly` and `sameSite=lax` at minimum. `Secure` is mandatory on every HTTPS deployment and off only for local `http` development. No OTP, provider secret or other sensitive value goes into client-readable session fields.
- The app reads its own session through `GET /api/v1/auth/session` (always 200; `{ loggedIn: false }` or `{ loggedIn: true, user }` with display names and Permissions, never id, phone or status) and an own `useAuthSession()` composable. The module's `/api/_auth/session` route is neutralised (`auth.loadStrategy` is `'none'`, `sessionHeader` is `false`). Permissions in the response are UX gating only.

### One-time codes

- Phone numbers are normalized to one canonical form before storage, uniqueness checks, lookup and throttling.
- `otp/request` (also resend) and a stateless `otp/verify` sit behind the `SmsProvider` seam, which serves OTP only. Accounts are created only in the panel, so verifying never registers a new phone. Unknown numbers, disabled accounts and undelivered SMS are indistinguishable to the caller, and error codes do not enumerate accounts.
- Codes are five-digit numeric strings from a cryptographically secure generator, expire after two minutes, allow at most ten attempts, and may be resent after 30 seconds with the same code until expiry. Rolling per-phone and per-IP limits apply, with no CAPTCHA. Exact numbers live in `.specs/authentication/spec.md`.
- The active code is stored in plaintext so a resend can repeat it; that is an explicit owner-accepted trade-off. The value is cleared on use, expiry or invalidation (a cleanup job nulls expired challenges) and is excluded from logs, audit, telemetry, the outbox and client-readable state.
- The mock adapter may return the code to the caller (`testCode`) only when `APP_ENV` is `local` or `test`.

### Authorization

- Enforce authorization in server routes and services, never only in the UI. Use `requireUser(event)` plus explicit Permission checks at the service boundary; route middleware in `app/middleware/` is for UX only.
- Default deny: API routes require a session unless they are on an explicit public allowlist.
- Permissions are defined in code and reconciled add-only by the seed; Roles are sets of Permissions, and a User's access is the union of their Roles. Role or Permission changes apply on the next request, so Permissions are read from the database or a correctly invalidated cache. Demoting a User revokes that User's sessions.
- The Default admin is seeded once from environment configuration. Later environment changes never mutate it. It is the only account of its kind, can never be disabled, and always holds the `super` Role. Only a `super` actor may act on `super`, nobody acts on their own account, and the protection is enforced by a service check and a database trigger.
- The Permission catalogue and its prerequisites are in `.specs/users-and-roles/spec.md`. Append-only audit requirements are in `.specs/audit-log/spec.md`. CSRF is ADR-0023, CSP is ADR-0022, and rendering with `private, no-store` auth responses is ADR-0013.

## Consequences

- Positive: server-side records give per-session logout and immediate account-wide revocation; the database stays authoritative for status and Permissions.
- Negative: every protected request needs a session and account lookup (or a carefully invalidated cache), activity writes must stay cheap, and cookie max-age must stay consistent with database expiry.

## Verification requirements

- Tests cover OTP success, failure, expiry and same-code resend, phone normalization, rate limits, enumeration resistance and disabled-account behavior.
- Tests prove logout revokes only the current session, disabling an account revokes every session, Permission changes apply on the next request, and idle and absolute expiry hold.
- Authorization tests prove an action hidden in the UI is still denied by the server without the matching Permission.
