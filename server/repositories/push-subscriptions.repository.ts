import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { Executor } from "../database/types";
import { pushSubscriptions } from "../database/schema";
import type { Locale } from "../../shared/constants/database-enums";

// SQL for the `push` Channel's devices (ADR-0028). The endpoint and the keys are capability material: only
// `findSendTarget` returns them, and only for the send itself.

export interface PushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  localeScope: Locale;
  deviceLabel: string;
}

export interface PushDevice {
  id: string;
  userId: string;
  localeScope: Locale;
  deviceLabel: string;
  createdAt: Date;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
}

export interface PushSendTarget {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const deviceColumns = {
  id: pushSubscriptions.id,
  userId: pushSubscriptions.userId,
  localeScope: pushSubscriptions.localeScope,
  deviceLabel: pushSubscriptions.deviceLabel,
  createdAt: pushSubscriptions.createdAt,
  lastSuccessAt: pushSubscriptions.lastSuccessAt,
  lastFailureAt: pushSubscriptions.lastFailureAt,
};

/** The User's push addresses: one subscription id per device, oldest first. */
export async function subscriptionIdsFor(db: Executor, userId: string): Promise<string[]> {
  const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).orderBy(asc(pushSubscriptions.createdAt), asc(pushSubscriptions.id));
  return rows.map((row) => row.id);
}

/** The User's devices without their endpoint or keys (the settings device list). */
export async function listDevices(db: Executor, userId: string): Promise<PushDevice[]> {
  return db.select(deviceColumns).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).orderBy(asc(pushSubscriptions.createdAt), asc(pushSubscriptions.id));
}

/** Creates the device, or moves an endpoint that belongs to another User to this one (keys and label refresh). */
export async function upsertSubscription(db: Executor, input: PushSubscriptionInput): Promise<PushDevice> {
  const [row] = await db
    .insert(pushSubscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: input.userId, p256dh: input.p256dh, auth: input.auth, localeScope: input.localeScope, deviceLabel: input.deviceLabel },
    })
    .returning(deviceColumns);
  return row!;
}

/** What a send needs, read at send time so the endpoint never rests anywhere else. */
export async function findSendTarget(db: Executor, id: string): Promise<PushSendTarget | null> {
  const [row] = await db
    .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.id, id))
    .limit(1);
  return row ?? null;
}

/** Deletes one device and returns what its audit event may say (never the endpoint or keys); null when it is already gone. */
export async function deleteSubscription(db: Executor, id: string): Promise<PushDevice | null> {
  const [row] = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id)).returning(deviceColumns);
  return row ?? null;
}

export async function markSuccess(db: Executor, id: string): Promise<void> {
  await db.update(pushSubscriptions).set({ lastSuccessAt: sql`now()` }).where(eq(pushSubscriptions.id, id));
}

export async function markFailure(db: Executor, id: string): Promise<void> {
  await db.update(pushSubscriptions).set({ lastFailureAt: sql`now()` }).where(eq(pushSubscriptions.id, id));
}

/** The endpoint's current owner, or null: lets a subscribe say it moved a device from another User (the owner id is audit-safe, the endpoint is not). */
export async function ownerOfEndpoint(db: Executor, endpoint: string): Promise<string | null> {
  const [row] = await db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).limit(1);
  return row?.userId ?? null;
}

/** Deletes the User's own device by id; null when it is gone or belongs to someone else. */
export async function deleteOwnedById(db: Executor, userId: string, id: string): Promise<PushDevice | null> {
  const [row] = await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId))).returning(deviceColumns);
  return row ?? null;
}

/** Deletes the User's own device by endpoint ("this browser"); null when it is gone or belongs to someone else. */
export async function deleteOwnedByEndpoint(db: Executor, userId: string, endpoint: string): Promise<PushDevice | null> {
  const [row] = await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId))).returning(deviceColumns);
  return row ?? null;
}

/** Deletes the devices with no success since `cutoff` (from `created_at` when they never had one); returns how many. */
export async function deleteStale(db: Executor, cutoff: Date): Promise<number> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(lt(sql`coalesce(${pushSubscriptions.lastSuccessAt}, ${pushSubscriptions.createdAt})`, cutoff))
    .returning({ id: pushSubscriptions.id });
  return rows.length;
}
