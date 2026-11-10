import { z } from "zod";
import { toLocaleDigits, type DigitLocale } from "../utils/locale-digits";

/** The newest unresolved Inbox item the User may see (read or not): the live Inbox's change marker. */
export const navNewestSchema = z.object({ id: z.string().uuid(), createdAt: z.string() });
export type NavNewest = z.output<typeof navNewestSchema>;

/**
 * The counts the User may see. A queue count is present only when the User holds the Permission of the queue's page;
 * a Project adds one optional key per queue here, its name in `NAV_QUEUE_COUNT_KEYS` and a row in the nav service.
 */
export const adminNavCountsSchema = z.object({
  /** The bell's count: every User gets it. */
  inboxUnread: z.number().int().min(0),
  /** The newest unresolved item the User may see, or null when there is none; it moves when new work arrives. */
  newest: navNewestSchema.nullable(),
  // demo-ticket:start
  /** Demo tickets still open or in progress; only for a User who may open the Demo tickets page. */
  openDemoTickets: z.number().int().min(0).optional(),
  // demo-ticket:end
});
export type AdminNavCounts = z.output<typeof adminNavCountsSchema>;

export const NAV_COUNT_CAP = 99;

/** The badge text: the count in the locale's digits, "99+" above 99. Zero and missing counts have no badge (null). */
export function formatNavCount(count: number | undefined, locale: DigitLocale): string | null {
  if (!count || count < 1) return null;
  return toLocaleDigits(count > NAV_COUNT_CAP ? `${NAV_COUNT_CAP}+` : String(count), locale);
}
