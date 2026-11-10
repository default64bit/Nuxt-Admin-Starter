import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../database/types";
import * as schema from "../database/schema";
import { findChannel, type AdminChannelRegistry, type AdminNotificationChannel, type ChannelDeliveryResult } from "./admin-channels";
import { channelAvailability, recordSend, type HealthLog } from "./channel-health";
import { findNotification, findRecipients, markSkipped } from "../repositories/admin-channels.repository";
import { ATTENTION_TYPES, attentionLink, type AttentionType } from "../../shared/constants/notification-catalog";
import { localizedPath } from "../../shared/utils/locale-path";
import type { SkipCategory } from "../../shared/constants/admin-channels";

// The outbox worker's logic (ADR-0021): claim due rows, send them to their Channel after the business transaction
// committed, record the outcome. A delivery failure never touches business state.

type OutboxRow = typeof schema.notificationOutbox.$inferSelect;

export const MAX_ATTEMPTS = 5;
/** Delay before the next attempt after the Nth failed attempt (bounded backoff; the 5th failure is terminal). */
export const BACKOFF_SECONDS = [60, 300, 900, 3600];
export const LEASE_SECONDS = 120;
export const SEND_TIMEOUT_MS = 10_000;
export const DELIVERED_RETENTION_DAYS = 90;
export const FAILED_RETENTION_DAYS = 180;
/** A skipped row is retained like a delivered one, counted from when it was skipped. */
export const SKIPPED_RETENTION_DAYS = DELIVERED_RETENTION_DAYS;

export interface WorkerDeps {
  db: Db;
  /** The outside Channels; defaults to the configured registry. */
  channels: AdminChannelRegistry;
  workerId: string;
  sendTimeoutMs?: number;
  /** Structured log sink for Channel health changes. */
  log?: HealthLog;
  /** Absolute site origin for the deep link in messages; without it messages carry no link. */
  siteUrl?: string | undefined;
}

/**
 * Atomically claims due rows (queued, or claimed with an expired lease from a crashed worker). `FOR UPDATE SKIP
 * LOCKED` guarantees two workers never claim the same row.
 */
export async function claimDue(db: Db, workerId: string, limit = 20): Promise<OutboxRow[]> {
  const result = await db.execute(sql`
    UPDATE notification_outbox
    SET status = 'claimed', leased_by = ${workerId}, leased_until = now() + make_interval(secs => ${LEASE_SECONDS})
    WHERE id IN (
      SELECT id FROM notification_outbox
      WHERE (status = 'queued' AND next_attempt_at <= now())
         OR (status = 'claimed' AND leased_until < now())
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const ids = result.rows.map((row) => String((row as { id: string }).id));
  if (!ids.length) return [];
  return db.select().from(schema.notificationOutbox).where(inArray(schema.notificationOutbox.id, ids));
}

const withTimeout = (send: Promise<ChannelDeliveryResult>, ms: number) =>
  Promise.race([send, new Promise<ChannelDeliveryResult>((resolve) => setTimeout(() => resolve({ ok: false, permanent: false, category: "timeout" }), ms).unref())]);

/**
 * Everything that must still hold at send time (ADR-0021 "Toggles"): the Channel is operational, the item is
 * unresolved, the User still holds its Permission and wants the Channel, and the address is unchanged. Returns the
 * category of the first miss, or null to send.
 */
async function skipReason(row: OutboxRow, channel: AdminNotificationChannel | undefined, deps: WorkerDeps): Promise<SkipCategory | null> {
  if (!channel || (await channelAvailability(deps.db, channel)) !== "operational") return "channel_unavailable";
  const notification = row.notificationId ? await findNotification(deps.db, row.notificationId) : null;
  if (!notification || !row.recipientUserId) return "recipient_ineligible";
  if (notification.resolvedAt) return "resolved_before_send";
  // An item that names a recipient is only ever for that User.
  if (notification.recipientUserId && notification.recipientUserId !== row.recipientUserId) return "recipient_ineligible";
  const [recipient] = await findRecipients(deps.db, { permission: notification.requiredPermission, channel: channel.key, userId: row.recipientUserId });
  if (!recipient) return "recipient_ineligible";
  if (!recipient.enabled) return "preference_off";
  const addresses = await channel.addressesFor(deps.db, row.recipientUserId);
  return row.recipient !== null && addresses.includes(row.recipient) ? null : "recipient_ineligible";
}

async function attemptNotification(row: OutboxRow, channel: AdminNotificationChannel, deps: WorkerDeps): Promise<ChannelDeliveryResult> {
  if (!row.recipient) return { ok: false, permanent: true, category: "payload_missing" };
  const tokens = row.tokens ?? [];
  if (tokens.length > 3) return { ok: false, permanent: true, category: "too_many_tokens" };
  const type = row.eventKey as AttentionType;
  if (!(type in ATTENTION_TYPES)) return { ok: false, permanent: true, category: "unknown_event" };
  const locale = row.locale ?? "fa";
  const notification = row.notificationId ? await findNotification(deps.db, row.notificationId) : null;
  const path = notification ? attentionLink(type, notification.sourceEntityId) : null;
  const link = path && deps.siteUrl ? `${deps.siteUrl.replace(/\/$/, "")}${localizedPath(path, locale)}` : null;
  try {
    const text = channel.render(type, tokens, locale, link);
    return await withTimeout(channel.send({ address: row.recipient, text, eventKey: row.eventKey, locale, link, notificationId: row.notificationId }, { db: deps.db }), deps.sendTimeoutMs ?? SEND_TIMEOUT_MS);
  } catch {
    // Never persist the error text: provider errors can echo recipients or credentials.
    return { ok: false, permanent: false, category: "provider_error" };
  }
}

/** A subscription system message (rebound, invalidated): no Inbox item and no recipient User, so no preference check. */
async function attemptSystem(row: OutboxRow, channel: AdminNotificationChannel, deps: WorkerDeps): Promise<ChannelDeliveryResult> {
  if (!row.recipient || !channel.sendSystem) return { ok: false, permanent: true, category: "payload_missing" };
  try {
    return await withTimeout(channel.sendSystem({ address: row.recipient, eventKey: row.eventKey, locale: row.locale ?? "fa" }), deps.sendTimeoutMs ?? SEND_TIMEOUT_MS);
  } catch {
    return { ok: false, permanent: false, category: "provider_error" };
  }
}

/** Records the outcome. Delivery state is independent of the source business state, which is never touched. */
async function settle(row: OutboxRow, result: ChannelDeliveryResult, db: Db) {
  const attempts = row.attemptCount + 1;
  const table = schema.notificationOutbox;
  const cleared = { leasedUntil: null, leasedBy: null };
  if (result.ok) {
    await db.update(table).set({ ...cleared, status: "delivered", deliveredAt: sql`now()`, attemptCount: attempts, lastFailureCategory: null }).where(eq(table.id, row.id));
    return "delivered" as const;
  }
  if (result.permanent || attempts >= MAX_ATTEMPTS) {
    await db.update(table).set({ ...cleared, status: "failed", terminalFailedAt: sql`now()`, attemptCount: Math.min(attempts, MAX_ATTEMPTS), lastFailureCategory: result.category }).where(eq(table.id, row.id));
    return "failed" as const;
  }
  // A provider's own "try again in" hint (such as a 429) can only lengthen the wait, never shorten the backoff.
  const delay = Math.max(BACKOFF_SECONDS[attempts - 1] ?? BACKOFF_SECONDS.at(-1)!, result.retryAfterSeconds ?? 0);
  await db.update(table).set({ ...cleared, status: "queued", attemptCount: attempts, lastFailureCategory: result.category, nextAttemptAt: sql`now() + make_interval(secs => ${delay})` }).where(eq(table.id, row.id));
  return "retry" as const;
}

/** A recipient that refused for good (a blocked bot, a missing chat) loses the subscription at that address. */
async function endRejectedSubscription(row: OutboxRow, result: ChannelDeliveryResult, channel: AdminNotificationChannel, deps: WorkerDeps) {
  if (result.ok || result.category !== "recipient_rejected" || !row.recipient || !channel.onRecipientRejected) return;
  try {
    await channel.onRecipientRejected(deps.db, row.recipient);
  } catch {
    deps.log?.({ level: "error", event: "subscription_end_failed", channel: channel.key });
  }
}

export async function processDue(deps: WorkerDeps, limit = 20) {
  const rows = await claimDue(deps.db, deps.workerId, limit);
  const summary = { claimed: rows.length, delivered: 0, failed: 0, retry: 0, skipped: 0 };
  const log = deps.log ?? (() => {});
  for (const row of rows) {
    const channel = findChannel(deps.channels, row.channel);
    // A row with no recipient User is a subscription system message: exempt from preferences, but it still waits for an operational Channel.
    if (!row.recipientUserId) {
      if (!channel || (await channelAvailability(deps.db, channel)) !== "operational") {
        await markSkipped(deps.db, row.id, "channel_unavailable");
        summary.skipped += 1;
        continue;
      }
      const result = await attemptSystem(row, channel, deps);
      summary[await settle(row, result, deps.db)] += 1;
      await recordSend(deps.db, channel, result, log);
      await endRejectedSubscription(row, result, channel, deps);
      continue;
    }
    const reason = await skipReason(row, channel, deps);
    if (reason) {
      await markSkipped(deps.db, row.id, reason);
      summary.skipped += 1;
      continue;
    }
    const result = await attemptNotification(row, channel!, deps);
    // Settle first: a breaker trip closes every queued row, including this one when it is waiting to retry.
    summary[await settle(row, result, deps.db)] += 1;
    await recordSend(deps.db, channel!, result, log);
    await endRejectedSubscription(row, result, channel!, deps);
  }
  return summary;
}

/**
 * Clears destination/payload values after the retention window, keeping idempotency and delivery metadata. Idempotent
 * and safe to rerun; never touches Inbox items or business records.
 */
export async function purgeExpiredPayloads(db: Db) {
  const table = schema.notificationOutbox;
  const purged = await db
    .update(table)
    .set({ recipient: null, tokens: null, payloadPurgedAt: sql`now()` })
    .where(
      and(
        isNull(table.payloadPurgedAt),
        sql`((${table.status} = 'delivered' AND ${table.deliveredAt} < now() - make_interval(days => ${DELIVERED_RETENTION_DAYS}))
          OR (${table.status} = 'failed' AND ${table.terminalFailedAt} < now() - make_interval(days => ${FAILED_RETENTION_DAYS}))
          OR (${table.status} = 'skipped' AND ${table.skippedAt} < now() - make_interval(days => ${SKIPPED_RETENTION_DAYS})))`,
      ),
    )
    .returning({ id: table.id });
  return purged.length;
}
