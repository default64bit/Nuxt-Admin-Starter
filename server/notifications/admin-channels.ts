import type { Db, Executor } from "../database/types";
import type { Locale } from "../../shared/constants/database-enums";
import type { AdminChannelKey } from "../../shared/constants/admin-channels";
import type { AttentionType } from "../../shared/constants/notification-catalog";

// The one contract every outside Notification Channel implements (ADR-0021). The Inbox is not a Channel: it is the base
// record every event writes. The Starter ships the contract, the outbox, the worker and the circuit breaker with an
// empty registry; the Telegram and Web Push adapters (Optional pieces) add themselves to `createAdminChannelRegistry`,
// and a later admin SMS or email Channel is one adapter plus one registry entry; domain services and events never change.

/** What configuration alone says; the breaker's `degraded` is layered on top by `channelAvailability`. */
export type ConfiguredAvailability = "operational" | "not_configured" | "disabled";

/** One delivery attempt. `category` is the only failure detail ever kept: never provider messages, recipients or tokens. */
export type ChannelDeliveryResult = { ok: true } | { ok: false; permanent: boolean; category: string; retryAfterSeconds?: number };

export interface AdminChannelMessage {
  /** The address snapshot on the outbox row (for Telegram, the chat id). */
  address: string;
  text: string;
  eventKey: string;
  locale: Locale;
  /** The absolute sign-in-gated link to the item, or null when the site has no public URL to give. */
  link: string | null;
  /** The Inbox item the message is about; null for none. */
  notificationId: string | null;
}

/** What a Channel may need beyond the message when it sends. */
export interface AdminSendContext {
  db: Db;
}

/** A message about the subscription itself (rebound, invalidated): no Inbox item, no preferences. */
export interface AdminSystemMessage {
  address: string;
  eventKey: string;
  locale: Locale;
}

export interface AdminNotificationChannel {
  readonly key: AdminChannelKey;
  /** Not configured (required config missing or bad) or disabled (the env kill switch); never throws. */
  availability(): ConfiguredAvailability;
  /** The User's addresses on this Channel; empty when they are unreachable. Telegram: zero or one chat; push: one id per device. */
  addressesFor(db: Executor, userId: string): Promise<string[]>;
  /** The message text for an event; at most the three non-personal tokens, plus the sign-in-gated link. */
  render(eventKey: AttentionType, tokens: readonly string[], locale: Locale, link: string | null): string;
  send(message: AdminChannelMessage, context: AdminSendContext): Promise<ChannelDeliveryResult>;
  /** Sends one subscription system message; a Channel without such messages leaves it out. */
  sendSystem?(message: AdminSystemMessage): Promise<ChannelDeliveryResult>;
  /** The recipient refused for good (a blocked bot, a missing chat): end the subscription at that address. */
  onRecipientRejected?(db: Db, address: string): Promise<void>;
  /** The cheap request the worker repeats while the Channel is degraded. */
  probe(): Promise<ChannelDeliveryResult>;
  /** Where a User without a connection goes to connect, when the Channel has such a place. */
  connectUrl?(): string | null;
}

export type AdminChannelRegistry = readonly AdminNotificationChannel[];

/** The registry from deployment configuration. Read in the app and in the worker alike, so both agree. */
export function createAdminChannelRegistry(): AdminChannelRegistry {
  return [];
}

let current: AdminChannelRegistry | null = null;

export function getAdminChannels(): AdminChannelRegistry {
  return (current ??= createAdminChannelRegistry());
}

/** Replaces the registry (tests install a fake adapter); `null` goes back to the configured one. */
export function setAdminChannels(registry: AdminChannelRegistry | null): void {
  current = registry;
}

export const findChannel = (registry: AdminChannelRegistry, key: string) => registry.find((channel) => channel.key === key);
