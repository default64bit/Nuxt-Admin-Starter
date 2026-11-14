import type { Db } from "../database/types";
import { deleteEndedBefore } from "../repositories/auth-sessions.repository";
import { invalidateExpired } from "../repositories/otp-challenges.repository";
import { deleteSentBefore } from "../repositories/otp-send-events.repository";
import { LONGEST_WINDOW_SECONDS } from "./otp-limits";

/**
 * The housekeeping of the sign-in tables, idempotent and safe to repeat:
 * - clears the plaintext code of challenges that expired without being used (ADR-0010);
 * - deletes OTP send events (phone, IP hash, user) older than the longest rolling limit window (24 hours). A rolling
 *   window counts only sends strictly inside it, so a row at or past the cutoff can no longer change any limit and
 *   removing it never lifts a block early;
 * - deletes sessions that ended more than a day ago.
 */
export async function purgeSignInData({ db, now }: { db: Db; now: () => Date }): Promise<{ challenges: number; sendEvents: number; sessions: number }> {
  const at = now();
  const dayAgo = new Date(at.getTime() - LONGEST_WINDOW_SECONDS * 1000);
  return {
    challenges: await invalidateExpired(db, at),
    sendEvents: await deleteSentBefore(db, dayAgo),
    sessions: await deleteEndedBefore(db, dayAgo),
  };
}
