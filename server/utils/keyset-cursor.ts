export interface KeysetPosition {
  /** The last row's `created_at` as an ISO-8601 UTC timestamp with microseconds. */
  createdAt: string;
  /** The last row's unique id: the tie-break after the time. */
  id: string;
}

const VERSION = 1;
const MAX_TOKEN_LENGTH = 1024;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An opaque keyset cursor over `(created_at, id)`: URL-safe base64url JSON holding only the last
 * row's key and the list it was issued for, so it can never address another user's rows and one
 * list's cursor is refused by another. The timestamp keeps its microseconds; a millisecond key would
 * skip rows that differ only below it.
 */
export function encodeKeysetCursor(kind: string, position: KeysetPosition): string {
  return Buffer.from(JSON.stringify({ v: VERSION, k: kind, t: position.createdAt, i: position.id })).toString("base64url");
}

/** The position a cursor encodes for `kind`, or null when it is malformed or was issued for another list. */
export function decodeKeysetCursor(kind: string, token: string): KeysetPosition | null {
  if (!token || token.length > MAX_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { v, k, t, i } = value as Record<string, unknown>;
  if (v !== VERSION || k !== kind || typeof t !== "string" || !TIMESTAMP.test(t) || typeof i !== "string" || !UUID.test(i)) return null;
  return { createdAt: t, id: i };
}
