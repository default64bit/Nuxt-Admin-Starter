import { decodeKeysetCursor, encodeKeysetCursor, type KeysetPosition } from "./keyset-cursor";

export type AuditDirection = "next" | "previous";
export interface AuditCursor extends KeysetPosition {
  direction: AuditDirection;
}

// The direction rides in the keyset kind, so a Next cursor can never be replayed as a Previous one.
const KIND = { next: "audit-next", previous: "audit-previous" } as const;

/** The audit feed's opaque cursor: a direction and the `(created_at, id)` of a boundary event, microsecond-precise. */
export const encodeAuditCursor = (direction: AuditDirection, position: KeysetPosition): string => encodeKeysetCursor(KIND[direction], position);

/** The cursor a token encodes, or null when it is malformed, tampered with or belongs to another list. */
export function decodeAuditCursor(token: string): AuditCursor | null {
  for (const direction of ["next", "previous"] as const) {
    const position = decodeKeysetCursor(KIND[direction], token);
    if (position) return { ...position, direction };
  }
  return null;
}
