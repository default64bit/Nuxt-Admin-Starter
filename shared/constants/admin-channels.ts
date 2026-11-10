import type { Locale } from "./database-enums";

// Outside Notification Channels (ADR-0021). The Inbox is the always-written base record and is not a Channel. `sms` and
// `email` are reserved keys with no adapter: adding one is an adapter plus a registry entry, never a change to domain
// services or events. The Telegram and Web Push adapters register themselves in `server/notifications/admin-channels.ts`.

export const ADMIN_CHANNEL_KEYS = ["telegram", "push"] as const;
export type AdminChannelKey = (typeof ADMIN_CHANNEL_KEYS)[number];
export const RESERVED_ADMIN_CHANNEL_KEYS = ["sms", "email"] as const;

/** `degraded` is the circuit breaker; the other two come from configuration (and the env kill switch). */
export const CHANNEL_AVAILABILITIES = ["operational", "not_configured", "disabled", "degraded"] as const;
export type ChannelAvailability = (typeof CHANNEL_AVAILABILITIES)[number];

/** Why a queued outbox row was closed without sending. */
export const SKIP_CATEGORIES = ["channel_unavailable", "preference_off", "recipient_ineligible", "resolved_before_send"] as const;
export type SkipCategory = (typeof SKIP_CATEGORIES)[number];

/** The breaker trips after this many consecutive transient failures across the Channel. */
export const BREAKER_THRESHOLD = 10;
/** While degraded, the worker probes the Channel this often; one success restores it. */
export const PROBE_INTERVAL_SECONDS = 300;
/** The category a send reports for rejected credentials; it trips the breaker at once. */
export const CREDENTIAL_FAILURE = "credential_failure";

export const DEFAULT_MESSAGE_LOCALE: Locale = "fa";
