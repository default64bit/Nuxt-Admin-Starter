/** What the browser may know about the session (`GET /api/v1/auth/session`). Permissions are for UX gating only. */
export interface SessionPayload {
  loggedIn: boolean;
  user?: {
    givenName: string | null;
    familyName: string | null;
    permissions: string[];
  };
}

export type SessionState = "loading" | "guest" | "user" | "error";

export const GUEST_SESSION: SessionPayload = { loggedIn: false };

/**
 * Collapses a query result into one state. Data wins over an error, so a failed background refresh
 * never signs the visitor out in the UI; with no data yet an error is its own state.
 */
export function deriveSessionState(query: { data: SessionPayload | undefined; isError: boolean }): SessionState {
  const { data } = query;
  if (data) return data.loggedIn ? "user" : "guest";
  return query.isError ? "error" : "loading";
}
