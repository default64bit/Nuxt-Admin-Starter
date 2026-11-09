import type { H3Event } from "h3";
import type { ResolvedSession } from "../services/session.service";

/**
 * The authenticated session of this request, memoized on the event so a render and its handlers share one lookup.
 * Placeholder until the authentication slice: no request is signed in, so every caller is a guest and the gate
 * answers 401. That slice replaces the body with the real lookup against the session registry.
 */
export function resolveAuthSession(event: H3Event): Promise<ResolvedSession | null> {
  const context = event.context as { authSession?: Promise<ResolvedSession | null> };
  context.authSession ??= Promise.resolve(null);
  return context.authSession;
}
