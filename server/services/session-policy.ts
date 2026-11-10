// Session lifetimes (.specs/authentication/spec.md). One policy applies to every User: a session ends after
// 30 minutes without activity or 12 hours after it was created, whichever comes first.

export interface SessionPolicy {
  idleSeconds: number;
  absoluteSeconds: number;
}

export const SESSION_POLICY: SessionPolicy = { idleSeconds: 30 * 60, absoluteSeconds: 12 * 3600 };

/** `idle_expires_at` is written at most once per this many seconds per session. */
export const ACTIVITY_WRITE_INTERVAL_SECONDS = 60;

const plus = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

export interface SessionTimes {
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

export const idleExpiryFrom = (lastSeenAt: Date): Date => plus(lastSeenAt, SESSION_POLICY.idleSeconds);
export const absoluteExpiryFrom = (createdAt: Date): Date => plus(createdAt, SESSION_POLICY.absoluteSeconds);

/** Live means not revoked and inside both the idle and the absolute window. Both are judged from the times, so the policy is the code's, not the row's. */
export function isSessionLive(session: SessionTimes, now: Date): boolean {
  if (session.revokedAt) return false;
  return absoluteExpiryFrom(session.createdAt) > now && idleExpiryFrom(session.lastSeenAt) > now;
}

export const shouldWriteActivity = (lastSeenAt: Date, now: Date): boolean => now.getTime() - lastSeenAt.getTime() >= ACTIVITY_WRITE_INTERVAL_SECONDS * 1000;
