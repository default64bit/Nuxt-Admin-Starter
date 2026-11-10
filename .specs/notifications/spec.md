# Notifications and the Inbox

Living spec for the Notification core (ADR-0021), the Inbox and Notification settings. Terms are in `CONTEXT.md`; the confirmed decisions are the "Notifications" section of `.specs/decision-log.md`. Telegram and Web Push are separate Optional pieces that plug into the Channel contract described here.

## Data

- `notifications`: one Inbox item per source event. `type` (catalogue key), `required_permission` (the gating key), optional `recipient_user_id`, `source_entity_type` / `source_entity_id`, up to three raw `tokens`, unique `dedupe_key`, `resolved_at`.
- `notification_reads`: per-User read state; a missing row is unread.
- `notification_outbox`: one row per event, Channel and address, written in the source transaction; claimed, leased, retried (5 attempts, bounded backoff) and retained (90 days delivered or skipped, 180 days failed, then recipient and tokens are purged) by the notification worker.
- `notification_channel_preferences` (per User and Channel, missing means on), `notification_settings` (Message language, missing means `fa`), `notification_channel_health` (the circuit breaker). Settings are personal preferences: not audited.

## Behaviour

- **Visibility is checked at read time.** An item is visible to a User who holds its gating Permission now; when it names a recipient, only to that User. Losing the Permission hides the item at once, regaining it shows it again. Marking read touches only the caller's row; a User who cannot see an item gets `404` on its read routes.
- **Events** are recorded in the source transaction with `recordNotificationEvent` and closed with `resolveAttention` / `resolveAttentionForSource` where the work ends. A replay with the same dedupe key writes nothing.
- **Channels**: the registry is empty in the Starter; an installed adapter implements `AdminNotificationChannel`. A Channel that is not configured, switched off or degraded gets no new rows and its queued rows close as `skipped`.
- **API** (`/api/v1/admin`, signed-in, no page key): `GET notifications` (`tab` unread/all/open/read, `type`, `page`, `limit`, `after`), `POST|DELETE notifications/:id/read`, `POST notifications/read-all`, `GET nav-counts`, `GET|PUT account/notification-settings` (`{ channels, locale }`).
- **Nav counts**: `inboxUnread`, `newest` and one optional count per queue, present only for a User who holds that queue page's key. The sidebar shows it as the item's badge (`countKey`); the app polls every 20 s while the tab is visible (backoff to 2 minutes), refetches on focus and navigation.
- **Inbox**: bell popover (Unread / Read, md and up; a link to the page below md) and the Inbox page (Unread / All tabs, Type select, 20 per page with Previous and Next). New items found by the poll toast (up to 2, else one summary), ring the bell and play a chime unless the device sound is off.
- **Notification settings** (user menu): Message language (default `fa`), one card per installed Channel, and the device sound switch.

<!-- demo-ticket:start -->
## Demo event: "Demo ticket assigned to you"

Gated by `view-demo-tickets`, addressed to the new assignee, one token (priority), link `/admin/demo-tickets?ticket=<id>`. Raised when a ticket is created with, or saved with, an assignee other than the actor and not already resolved or closed; never on self-assign. The dedupe key carries the assignment time, so each assignment is its own item. In the same transaction the open item closes when the ticket is reassigned (to anybody, or nobody), resolved, closed or deleted. The Demo tickets nav badge counts tickets that are open or in progress (`openDemoTickets`).
<!-- demo-ticket:end -->
