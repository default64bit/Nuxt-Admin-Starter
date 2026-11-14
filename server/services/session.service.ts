import type { Db, Executor } from "../database/types";
import { permissionKeysForUser } from "../repositories/access.repository";
import * as sessions from "../repositories/auth-sessions.repository";
import type { SessionPayload } from "../../shared/utils/session-state";
import { recordAudit } from "./admin-audit.service";
import { idleExpiryFrom, isSessionLive, shouldWriteActivity } from "./session-policy";

/** What a valid session resolves to, judged against the database on every request. */
export interface ResolvedSession {
  sessionId: string;
  userId: string;
  /** Holds the `super` Role, read per request from the account's Role memberships. */
  isSuper: boolean;
  /** Every Permission key granted by the account's Roles. */
  permissions: string[];
  givenName: string | null;
  familyName: string | null;
}

/**
 * Judges a session token against authoritative database state on every call: revocation, idle and absolute
 * expiry, and the account's enabled status. Roles and Permissions are read fresh, so a change applies on the
 * next request. A valid resolution extends the idle window, written at most once per 60 s per session.
 */
export async function resolveSession(tokenHash: string, deps: { db: Db; now: () => Date }): Promise<ResolvedSession | null> {
  const { db, now } = deps;
  const row = await sessions.findWithUser(db, tokenHash);
  if (!row || row.status === "disabled") return null;

  const at = now();
  if (!isSessionLive(row, at)) return null;

  const { isSuper, keys } = await permissionKeysForUser(db, row.userId);
  if (shouldWriteActivity(row.lastSeenAt, at)) {
    await sessions.touch(db, row.id, at, idleExpiryFrom(at));
  }
  return { sessionId: row.id, userId: row.userId, isSuper, permissions: keys, givenName: row.givenName, familyName: row.familyName };
}

/** The only fields the browser may learn: display names and Permissions for UX gating. No id, phone or status. */
export function toSessionPayload(session: ResolvedSession | null): SessionPayload {
  if (!session) return { loggedIn: false };
  return { loggedIn: true, user: { givenName: session.givenName, familyName: session.familyName, permissions: session.permissions } };
}

/**
 * Revokes the session behind this token (reason `logout`). Idempotent: an unknown, expired or already-revoked
 * token, or no token at all, changes nothing. Other sessions of the account stay valid.
 */
export async function logout(tokenHash: string | null, deps: { db: Db; now: () => Date; requestId?: string | undefined }): Promise<void> {
  if (!tokenHash) return;
  // A sign-out that ended a live session leaves an audit event; repeating it, or signing out as a guest, leaves none.
  await deps.db.transaction(async (tx) => {
    const revoked = await sessions.revokeByTokenHash(tx, tokenHash, "logout", deps.now());
    if (revoked) await recordAudit(tx, { actorUserId: revoked.userId, correlationId: deps.requestId }, { action: "auth.sign_out", entityType: "user", entityId: revoked.userId });
  });
}

/** Signs an account out everywhere, used by disablement. */
export async function revokeAllSessions(userId: string, reason: string, deps: { db: Executor; now: () => Date }): Promise<number> {
  return sessions.revokeAllForUser(deps.db, userId, reason, deps.now());
}
