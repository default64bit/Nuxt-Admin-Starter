import type { AdminAuditActor, AdminAuditListItem } from "../schemas/admin-audit-log";

/** The `Asia/Tehran` calendar day of a stored UTC instant, as `YYYY-MM-DD` (a day starts at Tehran midnight, not UTC). */
export function tehranDayKey(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export interface AuditDay {
  day: string;
  /** The first event's instant, for formatting the heading. */
  at: string;
  items: AdminAuditListItem[];
}

/** Day sections in the order of the (newest-first) items; an item never moves out of its day. */
export function groupAuditByDay(items: readonly AdminAuditListItem[]): AuditDay[] {
  const days: AuditDay[] = [];
  for (const item of items) {
    const day = tehranDayKey(item.createdAt);
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(item);
    else days.push({ day, at: item.createdAt, items: [item] });
  }
  return days;
}

/** The actor's name, else their phone in local form, else null (the system actor). */
export function auditActorName(actor: AdminAuditActor | null): { kind: "name"; text: string } | { kind: "phone"; text: string } | { kind: "system" } {
  if (!actor) return { kind: "system" };
  const name = `${actor.givenName ?? ""} ${actor.familyName ?? ""}`.trim();
  return name ? { kind: "name", text: name } : { kind: "phone", text: actor.phoneE164.replace(/^\+98/, "0") };
}
