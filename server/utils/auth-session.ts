import type { H3Event } from "h3";
import { hashSessionToken } from "../services/auth.service";
import { resolveSession, type ResolvedSession } from "../services/session.service";
import { useDb } from "./db";

/** nuxt-auth-utils' default cookie name; this app never renames it. */
const SESSION_COOKIE = "nuxt-session";

/** Hash of the opaque session token in this request's cookie, or null. Never the token itself. */
export async function currentTokenHash(event: H3Event): Promise<string | null> {
  // Reading the session of a request that has no cookie would make the module issue an empty one: a guest gets none.
  if (!getCookie(event, SESSION_COOKIE)) return null;
  const session = (await getUserSession(event)) as { secure?: { token?: unknown } };
  const token = session.secure?.token;
  return typeof token === "string" && token.length > 0 ? hashSessionToken(token) : null;
}

/**
 * The authenticated session of this request, judged against the database. Memoized on the event so a render
 * and its handlers share one lookup (and one throttled activity write). `null` is a guest, or a session that
 * expired, was revoked or belongs to a disabled account.
 */
export function resolveAuthSession(event: H3Event): Promise<ResolvedSession | null> {
  const context = event.context as { authSession?: Promise<ResolvedSession | null> };
  context.authSession ??= (async () => {
    const tokenHash = await currentTokenHash(event);
    return tokenHash ? resolveSession(tokenHash, { db: useDb(), now: () => new Date() }) : null;
  })();
  return context.authSession;
}
