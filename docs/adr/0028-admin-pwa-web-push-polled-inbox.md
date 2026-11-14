# ADR-0028: Admin PWA per locale, Web Push as a Channel, and a polled live Inbox

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Users hear about new work through the Inbox and optional Channels (ADR-0021). They want alerts in the browser they already use, without reloading. Web Push needs no Google, Firebase or Apple account. Manifest and service-worker scopes are single path prefixes, while the admin lives at both `/admin` (fa) and `/en/admin` (en).

## Decision

1. **Live Inbox by short polling.** The admin polls `GET /api/v1/admin/nav-counts` every 20 seconds while the tab is visible; a `newest` cursor tells the client when to fetch new items and alert (toast, bell, a Web Audio chime). No SSE, WebSocket or long polling, and no server-side fan-out to open tabs.
2. **Web Push is a Channel** (`push`) beside Telegram, sent directly from the notification worker with VAPID (`web-push`). It fans out **one outbox row per browser subscription**. Subscriptions **outlive sessions** (admin sessions end after 30 minutes idle); an explicit sign-out removes that browser's subscription, and disabling a User removes all of theirs. "Send test notification" goes to this browser only, at most once per 30 seconds, with no Inbox item, outbox row or audit entry.
3. **The admin is an installable app per locale:** one manifest and one service worker for `/admin` and another for `/en/admin`, served by Nitro routes behind the admin 404 gate. The worker has no `fetch` handler and uses no Cache Storage: it handles push, notification clicks and the app badge only. The landing page gets no manifest, worker or install prompt. The product name in push, PWA and banner copy comes from the one per-locale app name setting.
4. **Optional everywhere.** Missing VAPID keys make push "not configured"; the `NUXT_ADMIN_CHANNEL_PUSH_ENABLED` kill switch turns it off. Neither blocks startup or readiness (ADR-0029).

## Consequences

- New work appears within about 20 seconds in an open admin, and immediately when a push arrives while the admin is focused. The cost is one cheap request per visible tab every 20 seconds.
- Users get OS notifications with the admin closed, as long as the browser is running; offline browsers keep only the newest push per type (`Topic`, 12-hour TTL).
- Push depends on the browser vendors' push services being reachable from the server. The Channel has the usual breaker, probe and kill switch, and the Inbox remains the source of truth.
- Push text sits in OS notification centres, including on shared computers, so payloads carry only non-personal tokens.
- A User who switches language inside an installed app leaves its scope; both locales could be installed, but a browser holds one push subscription.
- A worker never caches pages or API data, so a stale worker can only break push, never page loads.

## Alternatives considered

- SSE or WebSocket: polling meets the "no reload" need with no long-lived connections through the proxy and no Nitro experimental features.
- One PWA scoped to `/`: captures the landing page into the app and puts a worker there.
- Moving the admin under one path for both locales: rewrites the localization contract.
- Tying subscriptions to sessions: pushes would stop half an hour after a User walks away.
- `@vite-pwa/nuxt`: builds one site-wide PWA with Workbox precaching and registers on every page.
