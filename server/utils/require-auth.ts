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

/** Requires any valid session: 401 `unauthenticated` otherwise. Ownership checks stay in services. */
export async function requireUser(event: H3Event, resolve: Resolve = resolveAuthSession): Promise<ResolvedSession> {
  return authorizeUser(await resolve(event));
}

/** A User's own state (their inbox, their settings), which carries no Permission key: 401 without a session. */
export async function requireSignedIn(event: H3Event, resolve: Resolve = resolveAuthSession): Promise<AdminActor> {
  return authorizeSignedIn(await resolve(event));
}

/** Call first in every guarded handler: 401 without a session, 403 without the Permission. */
export async function requirePermission(event: H3Event, key: PermissionKey, resolve: Resolve = resolveAuthSession): Promise<AdminActor> {
  return authorizePermission(await resolve(event), key);
}

/** Guard for lookups open to several Permissions: 401 without a session, 403 holding none of the keys. */
export async function requireAnyPermission(event: H3Event, keys: readonly PermissionKey[], resolve: Resolve = resolveAuthSession): Promise<AdminActor> {
  return authorizeAnyPermission(await resolve(event), keys);
}

/** Guard for actions that need several Permissions at once: 401 without a session, 403 unless every key is held. */
export async function requireAllPermissions(event: H3Event, keys: readonly PermissionKey[], resolve: Resolve = resolveAuthSession): Promise<AdminActor> {
  return authorizeAllPermissions(await resolve(event), keys);
}
