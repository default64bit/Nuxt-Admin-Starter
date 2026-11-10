import { isPrivatePagePath } from "../../shared/utils/route-rules";
import { isSignInPath, privateRouteRedirect } from "../../shared/utils/return-path";
import { currentTokenHash, resolveAuthSession } from "../utils/auth-session";

// Page requests only. Every page except the landing page and sign-in is private: a guest (or a visitor whose
// session ended) opening one is sent to /sign-in with a validated return path, and a signed-in visitor opening
// /sign-in is sent on. The landing page never touches the session, so it stays shared-cacheable.
export default defineEventHandler(async (event) => {
  if (event.method !== "GET" && event.method !== "HEAD") return;
  const url = getRequestURL(event);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_") || /\.[a-z0-9]+$/i.test(url.pathname)) return;

  // Cheap path test first so unrelated pages never touch the session store.
  if (!isSignInPath(url.pathname) && !isPrivatePagePath(url.pathname)) return;

  const session = await resolveAuthSession(event);
  // A cookie that no longer resolves is a session that ended (idle, absolute, revoked, disabled): say so on sign-in.
  const sessionEnded = !session && (await currentTokenHash(event)) !== null;
  const target = privateRouteRedirect({
    path: url.pathname.replace(/(.)\/+$/, "$1"),
    search: url.search,
    redirect: getQuery(event).redirect,
    signedIn: Boolean(session),
    sessionEnded,
  });
  if (sessionEnded) await clearUserSession(event);
  if (!target) return;
  setResponseHeader(event, "cache-control", "private, no-store");
  return sendRedirect(event, target, 302);
});
