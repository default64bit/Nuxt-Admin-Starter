import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { Executor } from "../database/types";
import { otpChallenges } from "../database/schema";

export type ActiveChallenge = {
  id: string;
  code: string | null;
  issuedAt: Date;
  expiresAt: Date;
};

const active = (phoneE164: string) =>
  and(eq(otpChallenges.phoneE164, phoneE164), eq(otpChallenges.purpose, "login"), isNull(otpChallenges.consumedAt), isNull(otpChallenges.invalidatedAt));

export async function findActiveLogin(db: Executor, phoneE164: string): Promise<ActiveChallenge | null> {
  const [row] = await db
    .select({ id: otpChallenges.id, code: otpChallenges.code, issuedAt: otpChallenges.issuedAt, expiresAt: otpChallenges.expiresAt })
    .from(otpChallenges)
    .where(active(phoneE164))
    .limit(1);
  return row ?? null;
}

/** Closes a challenge and clears its plaintext code (the code is only ever kept while active). */
export async function invalidate(db: Executor, id: string, at: Date) {
  await db.update(otpChallenges).set({ invalidatedAt: at, code: null }).where(eq(otpChallenges.id, id));
}

export async function insertLogin(db: Executor, values: { phoneE164: string; code: string; issuedAt: Date; expiresAt: Date }): Promise<ActiveChallenge> {
  const [row] = await db
    .insert(otpChallenges)
    .values({ phoneE164: values.phoneE164, purpose: "login", code: values.code, issuedAt: values.issuedAt, expiresAt: values.expiresAt, lastSentAt: values.issuedAt })
    .returning({ id: otpChallenges.id, code: otpChallenges.code, issuedAt: otpChallenges.issuedAt, expiresAt: otpChallenges.expiresAt });
  return row!;
}

export async function touchLastSent(db: Executor, id: string, at: Date) {
  await db.update(otpChallenges).set({ lastSentAt: at }).where(eq(otpChallenges.id, id));
}

/** Serializes concurrent requests for one phone for the rest of the transaction. */
export async function lockPhone(db: Executor, phoneE164: string) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`otp:${phoneE164}`}, 0))`);
}

/** Counts one verification attempt atomically and returns the new total. */
export async function incrementAttempts(db: Executor, id: string): Promise<number> {
  const [row] = await db
    .update(otpChallenges)
    .set({ attemptCount: sql`${otpChallenges.attemptCount} + 1` })
    .where(eq(otpChallenges.id, id))
    .returning({ attemptCount: otpChallenges.attemptCount });
  return row!.attemptCount;
}

/** Marks the challenge used and clears its plaintext code. */
export async function consume(db: Executor, id: string, at: Date) {
  await db.update(otpChallenges).set({ consumedAt: at, code: null }).where(eq(otpChallenges.id, id));
}

/** Clears the plaintext code of every challenge that expired at or before `at` and is still open. Returns how many were closed. */
export async function invalidateExpired(db: Executor, at: Date): Promise<number> {
  const rows = await db
    .update(otpChallenges)
    .set({ invalidatedAt: at, code: null })
    .where(and(isNull(otpChallenges.consumedAt), isNull(otpChallenges.invalidatedAt), lte(otpChallenges.expiresAt, at)))
    .returning({ id: otpChallenges.id });
  return rows.length;
}
