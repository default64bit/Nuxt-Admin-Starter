import { and, eq, isNull, lt, ne, or } from "drizzle-orm";
import type { Executor } from "../database/types";
import { authSessions, users } from "../database/schema";

export async function insert(
  db: Executor,
  values: {
    userId: string;
    tokenHash: string;
    createdAt: Date;
    lastSeenAt: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
    userAgent: string | null;
  },
) {
  const [row] = await db.insert(authSessions).values(values).returning({ id: authSessions.id });
  return row!;
}

export async function revokeByTokenHash(db: Executor, tokenHash: string, reason: string, at: Date) {
  await db
    .update(authSessions)
    .set({ revokedAt: at, revokedReason: reason })
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
}

export async function touch(db: Executor, id: string, lastSeenAt: Date, idleExpiresAt: Date) {
  await db.update(authSessions).set({ lastSeenAt, idleExpiresAt }).where(eq(authSessions.id, id));
}

/** The session joined with its account, whatever the session's state; the service judges liveness. */
export async function findWithUser(db: Executor, tokenHash: string) {
  const [row] = await db
    .select({
      id: authSessions.id,
      userId: authSessions.userId,
      createdAt: authSessions.createdAt,
      lastSeenAt: authSessions.lastSeenAt,
      revokedAt: authSessions.revokedAt,
      status: users.status,
      givenName: users.givenName,
      familyName: users.familyName,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

/** Revokes every live session of an account (disablement, demotion). Returns how many were revoked. */
export async function revokeAllForUser(db: Executor, userId: string, reason: string, at: Date): Promise<number> {
  const rows = await db
    .update(authSessions)
    .set({ revokedAt: at, revokedReason: reason })
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
    .returning({ id: authSessions.id });
  return rows.length;
}

/** Revokes every live session of an account except one (a phone change keeps the session that made it). */
export async function revokeAllForUserExcept(db: Executor, userId: string, keepSessionId: string, reason: string, at: Date): Promise<number> {
  const rows = await db
    .update(authSessions)
    .set({ revokedAt: at, revokedReason: reason })
    .where(and(eq(authSessions.userId, userId), ne(authSessions.id, keepSessionId), isNull(authSessions.revokedAt)))
    .returning({ id: authSessions.id });
  return rows.length;
}

/** Deletes sessions that ended (revoked or past absolute expiry) before `before`; they can no longer authenticate. Returns how many went. */
export async function deleteEndedBefore(db: Executor, before: Date): Promise<number> {
  const rows = await db
    .delete(authSessions)
    .where(or(lt(authSessions.revokedAt, before), lt(authSessions.absoluteExpiresAt, before)))
    .returning({ id: authSessions.id });
  return rows.length;
}
