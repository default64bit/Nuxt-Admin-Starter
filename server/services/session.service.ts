// The session abstraction the authorization gate is built on. Sign-in, the session registry and
// `resolveSession` arrive with the authentication slice; until then no request carries a session, so the
// gate answers every request as a guest. The gate takes a resolver as a parameter so it is proven without a database.

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
