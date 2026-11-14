import { and, count, desc, eq, inArray, isNull, lte, notExists, or, sql, type SQL } from "drizzle-orm";
import type { Executor } from "../database/types";
import type { InboxCursor } from "../../shared/utils/inbox-cursor";
import { notificationReads, notifications } from "../database/schema";
import { ATTENTION_TYPE_KEYS, type AttentionType } from "../../shared/constants/notification-catalog";
import type { InboxTab } from "../../shared/schemas/admin-notifications";

// The Inbox. Visibility is evaluated at read time from the User's current Permissions, so gaining a Permission shows the
// type's older items and losing it hides them; an item with a recipient is visible to that User only. Read state is one
// row per (item, User); a missing row is unread.

export interface Viewer {
  userId: string;
  permissions: readonly string[];
}

const visibleTo = (viewer: Viewer): SQL | undefined =>
  viewer.permissions.length === 0
    ? sql`false`
    : and(
        inArray(notifications.requiredPermission, [...viewer.permissions]),
        inArray(notifications.type, ATTENTION_TYPE_KEYS),
        or(isNull(notifications.recipientUserId), eq(notifications.recipientUserId, viewer.userId)),
      );

const unreadBy = (userId: string): SQL =>
  notExists(sql`(select 1 from ${notificationReads} where ${notificationReads.notificationId} = ${notifications.id} and ${notificationReads.userId} = ${userId})`);

const readBy = (userId: string): SQL =>
  sql`exists (select 1 from ${notificationReads} where ${notificationReads.notificationId} = ${notifications.id} and ${notificationReads.userId} = ${userId})`;

// The Inbox order is `(createdAt, id)` at the precision a cursor can carry (milliseconds), so a cursor taken from a
// row always sits at its own position: the database keeps microseconds, JavaScript and the wire do not.
const createdMs = sql`date_trunc('milliseconds', ${notifications.createdAt})`;

const afterCursor = (cursor: InboxCursor): SQL => sql`(${createdMs}, ${notifications.id}) > (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`;

export interface InboxRow {
  id: string;
  type: AttentionType;
  tokens: string[];
  sourceEntityType: string;
  sourceEntityId: string;
  createdAt: Date;
  resolvedAt: Date | null;
  read: boolean;
}

const tabFilter = (tab: InboxTab, userId: string): SQL | undefined =>
  tab === "unread" ? and(isNull(notifications.resolvedAt), unreadBy(userId)) : tab === "open" ? isNull(notifications.resolvedAt) : tab === "read" ? readBy(userId) : undefined;

/** The bell's count: unresolved, unread and visible. */
export async function countUnread(db: Executor, viewer: Viewer): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(visibleTo(viewer), isNull(notifications.resolvedAt), unreadBy(viewer.userId)));
  return row?.n ?? 0;
}

/** The newest unresolved item the User may see, read or not: the live Inbox's change marker. */
export async function newestUnresolved(db: Executor, viewer: Viewer): Promise<{ id: string; createdAt: Date } | null> {
  const [row] = await db
    .select({ id: notifications.id, createdAt: createdMs.mapWith(notifications.createdAt) })
    .from(notifications)
    .where(and(visibleTo(viewer), isNull(notifications.resolvedAt)))
    .orderBy(desc(createdMs), desc(notifications.id))
    .limit(1);
  return row ?? null;
}

export async function listInbox(
  db: Executor,
  query: { viewer: Viewer; tab: InboxTab; type?: AttentionType; limit: number; offset: number; after?: InboxCursor },
): Promise<{ rows: InboxRow[]; total: number }> {
  const where = and(visibleTo(query.viewer), tabFilter(query.tab, query.viewer.userId), query.type ? eq(notifications.type, query.type) : undefined, query.after ? afterCursor(query.after) : undefined);
  const [totalRow] = await db.select({ n: count() }).from(notifications).where(where);
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      tokens: notifications.tokens,
      sourceEntityType: notifications.sourceEntityType,
      sourceEntityId: notifications.sourceEntityId,
      createdAt: notifications.createdAt,
      resolvedAt: notifications.resolvedAt,
      read: sql<boolean>`${readBy(query.viewer.userId)}`,
    })
    .from(notifications)
    .where(where)
    .orderBy(desc(createdMs), desc(notifications.id))
    .limit(query.limit)
    .offset(query.offset);
  return { rows: rows.map((row) => ({ ...row, type: row.type as AttentionType, tokens: row.tokens ?? [] })), total: totalRow?.n ?? 0 };
}

/** Whether the User may see this item right now (it exists, has a known type, they hold its Permission and are its recipient if it names one). */
export async function isVisible(db: Executor, id: string, viewer: Viewer): Promise<boolean> {
  const [row] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.id, id), visibleTo(viewer))).limit(1);
  return row !== undefined;
}

export async function markRead(db: Executor, id: string, userId: string): Promise<void> {
  await db.insert(notificationReads).values({ notificationId: id, userId }).onConflictDoNothing();
}

export async function markUnread(db: Executor, id: string, userId: string): Promise<void> {
  await db.delete(notificationReads).where(and(eq(notificationReads.notificationId, id), eq(notificationReads.userId, userId)));
}

/** Marks every unresolved, visible, unread item created up to `before`; later items stay unread. Returns how many it marked. */
export async function markAllRead(db: Executor, viewer: Viewer, before: Date): Promise<number> {
  const pending = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(visibleTo(viewer), isNull(notifications.resolvedAt), unreadBy(viewer.userId), lte(notifications.createdAt, before)));
  if (pending.length === 0) return 0;
  const inserted = await db
    .insert(notificationReads)
    .values(pending.map((row) => ({ notificationId: row.id, userId: viewer.userId })))
    .onConflictDoNothing()
    .returning({ id: notificationReads.notificationId });
  return inserted.length;
}
