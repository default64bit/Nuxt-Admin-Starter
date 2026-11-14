import type { PermissionKey } from "../../shared/constants/permissions";
import { missingPrerequisites } from "../../shared/utils/permission-prerequisites";
import { DomainError, permissionPrerequisites } from "../utils/domain-errors";
import type { ResolvedSession } from "./session.service";

/** What a permission-guarded handler hands to services. */
export interface AdminActor {
  userId: string;
  /** The session making the request (a phone change keeps this one and ends the others). */
  sessionId: string;
  /** Holds the `super` Role (read per request); only a super actor may act on `super`. */
  isSuper: boolean;
  permissions: readonly string[];
  /** The request id (set by the guards), written into audit events as their correlation id. */
  requestId?: string;
  has(key: PermissionKey): boolean;
}

const unauthenticated = () => new DomainError(401, "Unauthorized", "unauthenticated");
const forbidden = () => new DomainError(403, "Forbidden", "forbidden");

const toActor = (session: ResolvedSession): AdminActor => ({
  userId: session.userId,
  sessionId: session.sessionId,
  isSuper: session.isSuper,
  permissions: session.permissions,
  has: (permission) => session.permissions.includes(permission),
});

/** 401 `unauthenticated` for no, expired, revoked or disabled sessions; never a hidden 404. */
export function authorizeUser(session: ResolvedSession | null): ResolvedSession {
  if (!session) throw unauthenticated();
  return session;
}

/**
 * 401 without a valid session, 403 when the session lacks the key. The session was resolved from authoritative
 * database state, so a UI that hides a control never changes what this allows.
 */
export function authorizePermission(session: ResolvedSession | null, key: PermissionKey): AdminActor {
  const valid = authorizeUser(session);
  if (!valid.permissions.includes(key)) throw forbidden();
  return toActor(valid);
}

/** Like `authorizePermission`, but any one of several keys is enough (read-only lookups used by more than one page). */
export function authorizeAnyPermission(session: ResolvedSession | null, keys: readonly PermissionKey[]): AdminActor {
  const valid = authorizeUser(session);
  if (!keys.some((key) => valid.permissions.includes(key))) throw forbidden();
  return toActor(valid);
}

/** Like `authorizePermission`, but every one of several keys is required (an action that spans Permissions, such as creating a User). */
export function authorizeAllPermissions(session: ResolvedSession | null, keys: readonly PermissionKey[]): AdminActor {
  const valid = authorizeUser(session);
  if (!keys.every((key) => valid.permissions.includes(key))) throw forbidden();
  return toActor(valid);
}

/** Any signed-in User, whatever their Roles grant: for a User's own pages and settings, which carry no Permission key. */
export const authorizeSignedIn = (session: ResolvedSession | null): AdminActor => toActor(authorizeUser(session));

/** A Role may only hold a set of Permissions that includes everything each of them needs: `422 permission_prerequisites` otherwise. */
export function assertPermissionPrerequisites(keys: readonly PermissionKey[]): void {
  const missing = missingPrerequisites(keys);
  if (missing.length > 0) throw permissionPrerequisites(missing);
}
