import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { Executor } from "../database/types";
import { otpSendEvents } from "../database/schema";

// Enough rows to evaluate every rolling limit (the largest is 100 per IP per day).
const MAX_ROWS = 100;

export async function recentSendTimesForPhone(db: Executor, phoneE164: string, since: Date): Promise<Date[]> {
  const rows = await db
    .select({ sentAt: otpSendEvents.sentAt })
    .from(otpSendEvents)
    .where(and(eq(otpSendEvents.phoneE164, phoneE164), gte(otpSendEvents.sentAt, since)))
    .orderBy(desc(otpSendEvents.sentAt))
    .limit(MAX_ROWS);
  return rows.map((row) => row.sentAt);
}

export async function recentSendTimesForIp(db: Executor, ipHash: string, since: Date): Promise<Date[]> {
  const rows = await db
    .select({ sentAt: otpSendEvents.sentAt })
    .from(otpSendEvents)
    .where(and(eq(otpSendEvents.ipHash, ipHash), gte(otpSendEvents.sentAt, since)))
    .orderBy(desc(otpSendEvents.sentAt))
    .limit(MAX_ROWS);
  return rows.map((row) => row.sentAt);
}

/** `userId` is set only for authenticated sends (a phone change); sign-in leaves it out. */
export async function record(db: Executor, values: { phoneE164: string; ipHash: string; sentAt: Date; userId?: string }) {
  await db.insert(otpSendEvents).values(values);
}

/** Deletes every send recorded strictly before `before`; returns how many rows went. */
export async function deleteSentBefore(db: Executor, before: Date): Promise<number> {
  const rows = await db.delete(otpSendEvents).where(lt(otpSendEvents.sentAt, before)).returning({ id: otpSendEvents.id });
  return rows.length;
}
