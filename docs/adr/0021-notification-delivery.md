# ADR-0021: Notification delivery

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Users need to learn about work they can act on through a persisted in-app Inbox, and optionally through outside Channels (Telegram, Web Push). A transport failure must never change committed business state, and a repeated request or callback must not produce a duplicate Notification. Telegram subscription must prove phone ownership and an active User.

## Decision

- **Durable, idempotent outbox.** A Notification is recorded in the same transaction as the business event (`recordNotificationEvent`) and resolved where the work ends (`resolveAttention`). Channel delivery happens after commit, in the separate notification worker, never inline. Delivery attempts and results are tracked per Channel, independent of the source state. The dedupe key is derived from the source event and Channel, so replays are blocked and transient failures retry without duplicating.
- **Inbox.** In-app Notifications are the always-on base record and the source for the bell, the Inbox page and the Dashboard's Needs attention module. Read state is per User. The Inbox cannot be turned off.
- **Optional recipient.** An Inbox item may name one recipient User. When set, only that User sees it and receives it on Channels, and only while they hold the item's gating Permission (checked at read time). When empty, everyone holding the Permission sees it.
- **Channels behind one interface.** Each outside Channel implements `AdminNotificationChannel` (Telegram and Web Push; admin SMS and email stay reserved keys with no adapter). `addressesFor` returns a list, so a Channel can fan out one outbox row per address: one per browser subscription for push, zero or one for Telegram. The dedupe key is `<channel>:<notificationId>:<address>`.
- **Toggles.** Every event reaches the Inbox and each Channel the recipient has on. Per deployment, a Channel is "not configured" when its config is missing (never a startup or readiness failure), has an env kill switch (`NUXT_ADMIN_CHANNEL_{TELEGRAM,PUSH}_ENABLED`) and an automatic circuit breaker (10 transient failures or one credential failure; probe every 5 minutes). A Channel that is unavailable gets no new rows and its queued rows close as `skipped`. Per User: on or off per Channel (default on) and one Message language (default `fa`).
- **Telegram** uses long polling inside the worker, in its own loop, with a PostgreSQL advisory lock so one consumer holds a token, behind a `TelegramUpdateSource` interface so a webhook can be added later. Long polling needs no public inbound endpoint. An optional HTTP(S) CONNECT proxy applies to Bot API calls only, through a per-agent `node:https` option (ADR-0019); no global proxy variables.
- **Web Push** is the second Channel (ADR-0028).
- **OTP is separate.** `SmsProvider` is a standalone seam that serves one-time passcodes only: it takes locale, recipient and the code, and maps them to the provider's OTP template slots (Kavenegar: `fa` and `en`). Business and auth services never call a vendor directly. There is no SMS outbox path. Codes are excluded from outbox payloads, logs, audit records and telemetry; only the active server-side challenge holds the code, for its short lifetime.
- **Privacy.** Payloads carry references and at most three non-personal tokens, never secrets or free-text user content, because tokens reach Telegram and OS notification centres.
- **Retry and retention.** At most five delivery attempts with bounded exponential backoff. Successful delivery payloads and destinations are kept 90 days and terminal failures 180 days, then sensitive fields are purged while minimal delivery and idempotency metadata stays. In-app Notifications and audit records are never purged implicitly.
- **Verification.** Tests cover duplicate source events, worker crash and restart, provider timeout, exhausted attempts, Telegram unsubscribe and rebind, per-User read-state isolation, every locale and event template mapping, the three-token limit, retention cleanup and redaction. A catalogue completeness test fails if an event lacks a field, translation or icon.

## Alternatives considered

- Sending inline before commit: a transport failure could affect user-visible operations and replays would double-send.
- Fire-and-forget without persisted state: restarts lose messages and failures are invisible.
- Telegram as the only task tracker: not every User subscribes, and the application needs an authoritative in-system queue.

## Consequences

- Positive: a Channel outage never rolls back business changes; operators can see failed deliveries; Projects add events with one catalogue entry.
- Negative / trade-offs: the outbox, worker, retention job and completeness tests are more machinery than inline sending.
- Follow-ups: admin SMS or email Channels, if a Project needs them, implement the same interface.
