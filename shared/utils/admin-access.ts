import type { SessionPayload } from "./session-state";

export type AdminRouteAccess = "allow" | "sign-in" | "forbidden";

/**
 * The route middleware's verdict for an admin page. It only improves client navigation and the server render (the
 * server's private-route guard and the API's Permission checks are the authority): a guest is sent to sign-in, a
 * signed-in User without the page's Permission gets the 403 page. The Dashboard declares no Permission, so any
 * signed-in User may open it.
 */
export function adminRouteAccess(session: Pick<SessionPayload, "loggedIn" | "user"> | undefined, permission: string | undefined): AdminRouteAccess {
  const user = session?.loggedIn ? session.user : undefined;
  if (!user) return "sign-in";
  return !permission || user.permissions.includes(permission) ? "allow" : "forbidden";
}
