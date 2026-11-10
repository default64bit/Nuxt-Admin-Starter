import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Db, Executor } from "../database/types";
import { notificationChannelHealth, notificationChannelPreferences, notificationOutbox, notificationSettings, notifications } from "../database/schema";
import { BREAKER_THRESHOLD, PROBE_INTERVAL_SECONDS, type AdminChannelKey, type SkipCategory } from "../../shared/constants/admin-channels";
import type { Locale } from "../../shared/constants/database-enums";

// SQL for the outside Channels: who is eligible, what they chose, the breaker row and the outbox rows.

export interface Recipient {
  userId: string;
  enabled: boolean;
  locale: Locale;
}

/**
 * The active Users who currently hold `permission`, with their choice for the Channel (a missing row is on) and their
 * Message language (default `fa`). With `userId` it answers for that one User, or nothing when they no longer qualify.
 */
export async function findRecipients(db: Executor, input: { permission: string; channel: AdminChannelKey; userId?: string }): Promise<Recipient[]> {
  const result = await db.execute(sql`
    SELECT u.id AS "userId",
           COALESCE(p.enabled, true) AS enabled,
           COALESCE(s.message_locale, 'fa') AS locale
    FROM users u
    LEFT JOIN notification_channel_preferences p ON p.user_id = u.id AND p.channel = ${input.channel}
    LEFT JOIN notification_settings s ON s.user_id = u.id
    WHERE u.status = 'active'
      ${input.userId ? sql`AND u.id = ${input.userId}` : sql``}
      AND EXISTS (
        SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = u.id AND rp.permission_key = ${input.permission})
    ORDER BY u.id`);
  return result.rows as unknown as Recipient[];
}

export interface OutboxInsert {
  dedupeKey: string;
  channel: AdminChannelKey;
  eventKey: string;
  locale: Locale;
  recipient: string;
  tokens: string[];
  sourceEntityType: string;
  sourceEntityId: string;
  notificationId: string;
  recipientUserId: string;
}

export async function insertOutbox(tx: Executor, row: OutboxInsert): Promise<string | undefined> {
  const [inserted] = await tx.insert(notificationOutbox).values(row).onConflictDoNothing({ target: notificationOutbox.dedupeKey }).returning({ id: notificationOutbox.id });
  return inserted?.id;
}

export async function findNotification(db: Executor, id: string) {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return row ?? null;
}

/** Closes one claimed row without sending; it never counts as an attempt. */
export async function markSkipped(db: Executor, rowId: string, category: SkipCategory): Promise<void> {
  await db
    .update(notificationOutbox)
    .set({ status: "skipped", skippedAt: sql`now()`, lastFailureCategory: category, leasedUntil: null, leasedBy: null })
    .where(eq(notificationOutbox.id, rowId));
}

/** Closes every queued row of a Channel at once (the breaker tripped); sent rows and system messages are untouched. */
export async function skipQueuedForChannel(tx: Executor, channel: AdminChannelKey): Promise<number> {
  const closed = await tx
    .update(notificationOutbox)
    .set({ status: "skipped", skippedAt: sql`now()`, lastFailureCategory: "channel_unavailable", leasedUntil: null, leasedBy: null })
    .where(and(eq(notificationOutbox.channel, channel), eq(notificationOutbox.status, "queued"), isNotNull(notificationOutbox.recipientUserId)))
    .returning({ id: notificationOutbox.id });
  return closed.length;
}

// ---- Preferences ----------------------------------------------------------------------------------------------

export async function preferencesOf(db: Executor, userId: string): Promise<Partial<Record<AdminChannelKey, boolean>>> {
  const rows = await db.select().from(notificationChannelPreferences).where(eq(notificationChannelPreferences.userId, userId));
  return Object.fromEntries(rows.map((row) => [row.channel, row.enabled]));
}

export async function messageLocaleOf(db: Executor, userId: string): Promise<Locale> {
  const [row] = await db.select({ locale: notificationSettings.messageLocale }).from(notificationSettings).where(eq(notificationSettings.userId, userId)).limit(1);
  return row?.locale ?? "fa";
}

export async function savePreference(tx: Executor, userId: string, channel: AdminChannelKey, enabled: boolean): Promise<void> {
  await tx
    .insert(notificationChannelPreferences)
    .values({ userId, channel, enabled })
    .onConflictDoUpdate({ target: [notificationChannelPreferences.userId, notificationChannelPreferences.channel], set: { enabled, updatedAt: sql`now()` } });
}

export async function saveMessageLocale(tx: Executor, userId: string, messageLocale: Locale): Promise<void> {
  await tx
    .insert(notificationSettings)
    .values({ userId, messageLocale })
    .onConflictDoUpdate({ target: notificationSettings.userId, set: { messageLocale, updatedAt: sql`now()` } });
}

// ---- Channel health (the breaker) -----------------------------------------------------------------------------

export interface HealthRow {
  channel: AdminChannelKey;
  status: "operational" | "degraded";
  since: Date;
  consecutiveFailures: number;
  lastFailureCategory: string | null;
  nextProbeAt: Date | null;
}

export async function healthOf(db: Executor, channel: AdminChannelKey): Promise<HealthRow | null> {
  const [row] = await db.select().from(notificationChannelHealth).where(eq(notificationChannelHealth.channel, channel)).limit(1);
  return (row as HealthRow | undefined) ?? null;
}

export type SendOutcome = { kind: "success" } | { kind: "transient"; category: string } | { kind: "credential"; category: string };
export type HealthTransition = "degraded" | "restored" | null;

/**
 * Folds one send (or probe) outcome into the Channel's health in a single transaction. Ten consecutive transient
 * failures, or one credential failure, trip the breaker: queued rows are closed as `channel_unavailable` and a probe is
 * scheduled. Any success restores it. Returns the transition so the caller can log and report it.
 */
export async function applyOutcome(db: Db, channel: AdminChannelKey, outcome: SendOutcome): Promise<HealthTransition> {
  return db.transaction(async (tx) => {
    await tx.insert(notificationChannelHealth).values({ channel }).onConflictDoNothing();
    const [row] = await tx.select().from(notificationChannelHealth).where(eq(notificationChannelHealth.channel, channel)).for("update");
    const table = notificationChannelHealth;
    if (outcome.kind === "success") {
      if (row!.status === "degraded") {
        await tx.update(table).set({ status: "operational", since: sql`now()`, consecutiveFailures: 0, nextProbeAt: null }).where(eq(table.channel, channel));
        return "restored" as const;
      }
      if (row!.consecutiveFailures > 0) await tx.update(table).set({ consecutiveFailures: 0 }).where(eq(table.channel, channel));
      return null;
    }
    const failures = row!.consecutiveFailures + 1;
    if (row!.status === "degraded") {
      await tx.update(table).set({ consecutiveFailures: failures, lastFailureCategory: outcome.category }).where(eq(table.channel, channel));
      return null;
    }
    const trips = outcome.kind === "credential" || failures >= BREAKER_THRESHOLD;
    if (!trips) {
      await tx.update(table).set({ consecutiveFailures: failures, lastFailureCategory: outcome.category }).where(eq(table.channel, channel));
      return null;
    }
    await tx
      .update(table)
      .set({ status: "degraded", since: sql`now()`, consecutiveFailures: failures, lastFailureCategory: outcome.category, nextProbeAt: sql`now() + make_interval(secs => ${PROBE_INTERVAL_SECONDS})` })
      .where(eq(table.channel, channel));
    await skipQueuedForChannel(tx, channel);
    return "degraded" as const;
  });
}

/** Takes the probe slot of a degraded Channel whose time has come (so two workers never probe at once). */
export async function claimProbe(db: Executor, channel: AdminChannelKey): Promise<boolean> {
  const claimed = await db
    .update(notificationChannelHealth)
    .set({ nextProbeAt: sql`now() + make_interval(secs => ${PROBE_INTERVAL_SECONDS})` })
    .where(and(eq(notificationChannelHealth.channel, channel), eq(notificationChannelHealth.status, "degraded"), sql`${notificationChannelHealth.nextProbeAt} <= now()`))
    .returning({ channel: notificationChannelHealth.channel });
  return claimed.length > 0;
}
