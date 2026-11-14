import { z } from "zod";
import { AUDIT_GROUPS } from "../constants/audit-actions";
import type { AuditOpenLink } from "../utils/audit-links";

/** The feed shows 20 events per page, newest first, paged with an opaque keyset cursor (no totals, no page numbers). */
export const AUDIT_PAGE_SIZE = 20;
const realDay = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};
/** A Gregorian `YYYY-MM-DD` Asia/Tehran day that exists on the calendar. */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(realDay);

/**
 * `GET /api/v1/admin/audit-log` (.specs/audit-log/spec.md "Filters" and "Cursor paging"). All parameters are optional and
 * combine with AND. `q` is an exact entity id or request id; `actor` is a user id or `system`; days are inclusive
 * Tehran days.
 */
export const adminAuditListQuerySchema = z.object({
  cursor: z
    .string()
    .max(1024)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  q: z.string().trim().min(1).max(100).optional(),
  group: z.enum(AUDIT_GROUPS).optional(),
  actor: z.union([z.literal("system"), z.uuid()]).optional(),
  from: day.optional(),
  to: day.optional(),
});
export type AdminAuditListQuery = z.output<typeof adminAuditListQuerySchema>;

export interface AdminAuditActor {
  id: string;
  givenName: string | null;
  familyName: string | null;
  phoneE164: string;
}

/** One row of the feed: a bounded projection, never the raw change summary. */
export interface AdminAuditListItem {
  id: string;
  createdAt: string;
  action: string;
  outcome: "success" | "denied" | "failed";
  reason: string | null;
  actor: AdminAuditActor | null;
  entityType: string;
  entityId: string | null;
  changeCount: number;
  /** The record's own admin page, present only when the record still exists; the client adds the locale and checks the viewer's Permission. */
  link: Pick<AuditOpenLink, "kind" | "path" | "permission"> | null;
}

/** Each cursor is null when nothing lies further in that direction (Previous disabled on the newest page, Next on the last). */
export interface AdminAuditList {
  items: AdminAuditListItem[];
  nextCursor: string | null;
  previousCursor: string | null;
}

/** One event in full, fetched when its card opens: the stored (already redacted) summary, never more. */
export interface AdminAuditEvent {
  id: string;
  createdAt: string;
  action: string;
  outcome: "success" | "denied" | "failed";
  reason: string | null;
  actor: AdminAuditActor | null;
  entityType: string;
  entityId: string | null;
  correlationId: string | null;
  summary: unknown;
}

/** `GET /api/v1/admin/audit-log/actors`: every User with at least one event, for the Actor select ("System" is added by the client). */
export interface AdminAuditActors {
  items: AdminAuditActor[];
}
