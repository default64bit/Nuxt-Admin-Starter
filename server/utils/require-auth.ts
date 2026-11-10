import type { H3Event } from "h3";
import type { PermissionKey } from "../../shared/constants/permissions";
import {
  authorizeAllPermissions,
  authorizeAnyPermission,
  authorizePermission,
  authorizeSignedIn,
  authorizeUser,
  type AdminActor,
} from "../services/authorization";
import type { ResolvedSession } from "../services/session.service";
import { resolveAuthSession } from "./auth-session";

// The guards every `/api/v1` handler that needs a session calls first. Each takes an optional resolver so the guard
// can be exercised without a database; handlers never pass it.
type Resolve = (event: H3Event) => Promise<ResolvedSession | null>;

/**
 * What the error handler may know about a refused admin request (.specs/audit-log/spec.md): who asked, nothing else.
 * Set by every guard once a valid session is resolved, before the Permission check, so a 403 can be recorded.
 */
export interface AdminAttemptContext {
  userId: string;
}

/** Remembers the signed-in User on the request for the refused-attempt audit hook. A missing session stashes nothing. */
export function stashAdminAttempt(event: H3Event, session: ResolvedSession | null): void {
  if (session) (event.context as { adminAttempt?: AdminAttemptContext }).adminAttempt = { userId: session.userId };
}

/** Gives the actor the request id, so services can tie the audit events they write to the structured logs. */
const withRequestId = (event: H3Event, actor: AdminActor): AdminActor => {
  const requestId = (event.context as { requestId?: string }).requestId;
  return requestId ? { ...actor, requestId } : actor;
};

async function resolved(event: H3Event, resolve: Resolve): Promise<ResolvedSession | null> {
  const session = await resolve(event);
  stashAdminAttempt(event, session);
  return session;
}

/** Requires any valid session: 401 `unauthenticated` otherwise. Ownership checks stay in services. */
export async function requireUser(event: H3Event, resolve: Resolve = resolveAuthSession): Promise<ResolvedSession> {
  return authorizeUser(await resolved(event, resolve));
}

/** A User's own state (their inbox, their settings), which carries no Permission key: 401 without a session. */
export async function requireSignedIn(event: H3Event, resolve: Resolve = resolveAuthSession): Promise<AdminActor> {
  return withRequestId(event, authorizeSignedIn(await resolved(event, resolve)));
}

/** Call first in every guarded handler: 401 without a session, 403 without the Permission. */
export async function requirePermission(event: H3Event, key: PermissionKey, resolve: Resolve = resolveAuthSession): Promise<AdminActor> {
  return withRequestId(event, authorizePermission(await resolved(event, resolve), key));
}

/** Guard for lookups open to several Permissions: 401 without a session, 403 holding none of the keys. */
export async function requireAnyPermission(event: H3Event, keys: readonly PermissionKey[], resolve: Resolve = resolveAuthSession): Promise<AdminActor> {
  return withRequestId(event, authorizeAnyPermission(await resolved(event, resolve), keys));
}

/** Guard for actions that need several Permissions at once: 401 without a session, 403 unless every key is held. */
export async function requireAllPermissions(event: H3Event, keys: readonly PermissionKey[], resolve: Resolve = resolveAuthSession): Promise<AdminActor> {
  return withRequestId(event, authorizeAllPermissions(await resolved(event, resolve), keys));
}
