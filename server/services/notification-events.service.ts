import type { Tx } from "../database/types";
import * as repository from "../repositories/notification-events.repository";
import { fanOutChannels } from "./notification-channel-fanout.service";
import { attentionDedupeKey, attentionDefinition, attentionSource, type AttentionIds, type AttentionType } from "../../shared/constants/notification-catalog";

// The one way a business change raises a Notification (ADR-0021). Both helpers take the caller's transaction, so an event
// exists exactly when the change that caused it committed, and a replay (repeated transition, duplicate callback) writes
// nothing new because the insert is `ON CONFLICT (dedupe_key) DO NOTHING`. Delivery to Channels happens later in the
// worker; a failed send never touches business state.

export interface AttentionEventInput<T extends AttentionType = AttentionType> {
  type: T;
  ids: AttentionIds<T>;
  /** Non-personal values by name; stored raw, in the type's token order. Never free text a User typed. */
  tokens: Record<string, string | number>;
  /** When set, only this User sees the item and receives it on Channels (and only while they hold its Permission). */
  recipientUserId?: string;
}

export interface RecordResult {
  /** False when the event had already been recorded and nothing was written. */
  created: boolean;
}

export async function recordNotificationEvent<T extends AttentionType>(tx: Tx, event: AttentionEventInput<T>): Promise<RecordResult> {
  const { type } = event;
  const ids = event.ids as never;
  const definition = attentionDefinition(type);
  const source = attentionSource(type, ids);
  const tokens = definition.tokens.map((name) => {
    const value = event.tokens[name];
    if (value === undefined || value === "") throw new Error(`Notification ${type} needs a ${name} token`);
    return String(value);
  });
  const recipientUserId = event.recipientUserId ?? null;
  const inserted = await repository.insertAttention(tx, {
    type,
    requiredPermission: definition.permission,
    recipientUserId,
    sourceEntityType: source.type,
    sourceEntityId: source.id,
    tokens,
    dedupeKey: attentionDedupeKey(type, ids),
  });
  // A replay inserted nothing, so it queues nothing; a new item reaches each User's chosen Channels.
  if (inserted !== undefined) await fanOutChannels(tx, { id: inserted, type, requiredPermission: definition.permission, recipientUserId, sourceEntityType: source.type, sourceEntityId: source.id, tokens });
  return { created: inserted !== undefined };
}

/**
 * Marks the item done when its underlying task ends, in the resolving transaction. Sets `resolved_at` once: true for the
 * call that resolved it, false for a repeat or a key never raised.
 */
export function resolveAttention(tx: Tx, dedupeKey: string): Promise<boolean> {
  return repository.markResolved(tx, dedupeKey);
}

/** Resolves every open item of `type` about one source entity (when a task has had several occurrences). Returns how many it closed. */
export function resolveAttentionForSource(tx: Tx, type: AttentionType, sourceEntityType: string, sourceId: string): Promise<number> {
  return repository.markResolvedForSource(tx, type, sourceEntityType, sourceId);
}
