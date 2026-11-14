import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Executor } from "../database/types";
import { adminAuditEvents, roles, users } from "../database/schema";

export interface NewAuditEvent {
  /** Null for the system actor (nobody signed in). */
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: "success" | "denied" | "failed";
  /** A safe, redacted summary of what changed (never secrets, one-time codes or tokens). */
  changeSummary?: Record<string, unknown> | null;
  reason?: string | null;
  correlationId?: string | null;
}

/** Append-only: the table rejects UPDATE, DELETE and TRUNCATE by trigger, so this is the only write there is. */
export async function insertAuditEvent(db: Executor, event: NewAuditEvent): Promise<void> {
  await db.insert(adminAuditEvents).values({
    actorUserId: event.actorUserId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    outcome: event.outcome,
    changeSummary: event.changeSummary ?? null,
    reason: event.reason ?? null,
    correlationId: event.correlationId ?? null,
  });
}

export interface AuditListRow {
  id: string;
  createdAt: Date;
  /** The cursor key: microsecond-precise ISO text (a JavaScript date would cut it to milliseconds). */
  createdAtKey: string;
  action: string;
  outcome: "success" | "denied" | "failed";
  reason: string | null;
  entityType: string;
  entityId: string | null;
  changeSummary: unknown;
  actorId: string | null;
  actorGivenName: string | null;
  actorFamilyName: string | null;
  actorPhoneE164: string | null;
}

const timestampText = (value: unknown) => sql<string>`to_char(${value} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const selection = {
  id: adminAuditEvents.id,
  createdAt: adminAuditEvents.createdAt,
  createdAtKey: timestampText(adminAuditEvents.createdAt),
  action: adminAuditEvents.action,
  outcome: adminAuditEvents.outcome,
  reason: adminAuditEvents.reason,
  entityType: adminAuditEvents.entityType,
  entityId: adminAuditEvents.entityId,
  changeSummary: adminAuditEvents.changeSummary,
  actorId: users.id,
  actorGivenName: users.givenName,
  actorFamilyName: users.familyName,
  actorPhoneE164: users.phoneE164,
};

/** The page's filters, already resolved: an exact id, the group's exact action keys, an actor, and a half-open time range. */
export interface AuditFilter {
  /** Matches an exact entity id or an exact request id (case-sensitive). */
  q?: string;
  actionKeys?: readonly string[];
  /** A user id, or `system` for events with no actor. */
  actor?: string;
  from?: Date;
  until?: Date;
}

/**
 * Events on `(created_at, id)`, newest first, strictly after (`next`, older) or strictly before (`previous`,
 * newer) the boundary key; with no boundary, from the newest. Returns up to `limit` rows in newest-first order
 * whichever way it was read. Read-only.
 */
export async function listAuditEvents(db: Executor, limit: number, boundary: { direction: "next" | "previous"; createdAt: string; id: string } | null, filter: AuditFilter = {}): Promise<AuditListRow[]> {
  const newer = boundary?.direction === "previous";
  const key = sql`(${adminAuditEvents.createdAt}, ${adminAuditEvents.id})`;
  const conditions = [
    filter.q === undefined ? undefined : or(eq(adminAuditEvents.entityId, filter.q), eq(adminAuditEvents.correlationId, filter.q)),
    filter.actionKeys === undefined ? undefined : inArray(adminAuditEvents.action, filter.actionKeys),
    filter.actor === undefined ? undefined : filter.actor === "system" ? isNull(adminAuditEvents.actorUserId) : eq(adminAuditEvents.actorUserId, filter.actor),
    filter.from === undefined ? undefined : gte(adminAuditEvents.createdAt, filter.from),
    filter.until === undefined ? undefined : lt(adminAuditEvents.createdAt, filter.until),
  ];
  const rows = await db
    .select(selection)
    .from(adminAuditEvents)
    .leftJoin(users, eq(users.id, adminAuditEvents.actorUserId))
    .where(and(...conditions, boundary ? (newer ? sql`${key} > (${boundary.createdAt}::timestamptz, ${boundary.id}::uuid)` : sql`${key} < (${boundary.createdAt}::timestamptz, ${boundary.id}::uuid)`) : undefined))
    .orderBy(...(newer ? [asc(adminAuditEvents.createdAt), asc(adminAuditEvents.id)] : [desc(adminAuditEvents.createdAt), desc(adminAuditEvents.id)]))
    .limit(limit);
  return newer ? rows.reverse() : rows;
}

/** One event with its full stored summary and request id, or null. */
export async function findAuditEvent(db: Executor, id: string): Promise<(AuditListRow & { correlationId: string | null }) | null> {
  const [row] = await db
    .select({ ...selection, correlationId: adminAuditEvents.correlationId })
    .from(adminAuditEvents)
    .leftJoin(users, eq(users.id, adminAuditEvents.actorUserId))
    .where(eq(adminAuditEvents.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Whether the actor already has a `denied`/`failed` event with this action, entity id, outcome and reason code written
 * at or after `since` (the dedupe lookup of the flood control). Uses the `(actor_user_id, created_at desc)` index.
 */
export async function hasRecentAttempt(
  db: Executor,
  key: { actorUserId: string; action: string; entityId: string | null; outcome: "denied" | "failed"; reasonCode: string },
  since: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ id: adminAuditEvents.id })
    .from(adminAuditEvents)
    .where(
      and(
        eq(adminAuditEvents.actorUserId, key.actorUserId),
        eq(adminAuditEvents.action, key.action),
        key.entityId === null ? isNull(adminAuditEvents.entityId) : eq(adminAuditEvents.entityId, key.entityId),
        eq(adminAuditEvents.outcome, key.outcome),
        sql`${adminAuditEvents.changeSummary} ->> 'reasonCode' = ${key.reasonCode}`,
        gte(adminAuditEvents.createdAt, since),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** The users that exist, one query: each id maps to whether it is found (a link to a deleted record is dropped). */
export async function existingUserIds(db: Executor, ids: readonly string[]): Promise<Set<string>> {
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.id, [...ids]));
  return new Set(rows.map((row) => row.id));
}

/** The Roles that exist, one query. */
export async function existingRoleIds(db: Executor, ids: readonly string[]): Promise<Set<string>> {
  const rows = await db.select({ id: roles.id }).from(roles).where(inArray(roles.id, [...ids]));
  return new Set(rows.map((row) => row.id));
}

/** The distinct Users with at least one event, ordered by name then phone. Events with no actor are the client's "System" option. */
export async function listAuditActors(db: Executor): Promise<{ id: string; givenName: string | null; familyName: string | null; phoneE164: string }[]> {
  return db
    .selectDistinct({ id: users.id, givenName: users.givenName, familyName: users.familyName, phoneE164: users.phoneE164 })
    .from(adminAuditEvents)
    .innerJoin(users, eq(users.id, adminAuditEvents.actorUserId))
    .orderBy(asc(users.givenName), asc(users.familyName), asc(users.phoneE164));
}

/** The actor's `denied`/`failed` events since `since`, not counting the cap marker (the cap is on real refusals). */
export async function countRecentAttempts(db: Executor, actorUserId: string, since: Date, markerAction: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminAuditEvents)
    .where(and(eq(adminAuditEvents.actorUserId, actorUserId), inArray(adminAuditEvents.outcome, ["denied", "failed"]), ne(adminAuditEvents.action, markerAction), gte(adminAuditEvents.createdAt, since)));
  return row?.n ?? 0;
}

/** Whether the actor already has the cap marker in the window. */
export async function hasAttemptMarker(db: Executor, actorUserId: string, since: Date, markerAction: string): Promise<boolean> {
  const [row] = await db
    .select({ id: adminAuditEvents.id })
    .from(adminAuditEvents)
    .where(and(eq(adminAuditEvents.actorUserId, actorUserId), eq(adminAuditEvents.action, markerAction), gte(adminAuditEvents.createdAt, since)))
    .limit(1);
  return Boolean(row);
}
