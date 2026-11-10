import type { Db } from "../database/types";
import { auditKeysOfGroup } from "../../shared/constants/audit-actions";
import { joinInstant } from "../../shared/utils/tehran-time";
import { AUDIT_PAGE_SIZE, type AdminAuditActors, type AdminAuditListQuery, type AdminAuditEvent, type AdminAuditList, type AdminAuditListItem } from "../../shared/schemas/admin-audit-log";
import { changeRows } from "../../shared/utils/audit-changes";
import { auditOpenLinkOf, type AuditLookupType } from "../../shared/utils/audit-links";
import { existingRoleIds, existingUserIds, findAuditEvent, listAuditActors, listAuditEvents, type AuditFilter, type AuditListRow } from "../repositories/admin-audit.repository";
import { decodeAuditCursor, encodeAuditCursor } from "../utils/audit-cursor";
import { DomainError } from "../utils/domain-errors";

const toActor = (row: AuditListRow): AdminAuditListItem["actor"] =>
  row.actorId && row.actorPhoneE164 ? { id: row.actorId, givenName: row.actorGivenName, familyName: row.actorFamilyName, phoneE164: row.actorPhoneE164 } : null;

const toItem = (row: AuditListRow): AdminAuditListItem => ({
  id: row.id,
  createdAt: row.createdAt.toISOString(),
  action: row.action,
  outcome: row.outcome,
  reason: row.reason,
  actor: toActor(row),
  entityType: row.entityType,
  entityId: row.entityId,
  // Only the count leaves the server in the list: the raw summary is read for these rows and not returned.
  changeCount: changeRows(row.changeSummary).length,
  link: null,
});

/**
 * The Open links whose record still exists: one batched query per entity type that appears, none for a type no row
 * names. A link whose record is gone is dropped.
 */
async function resolveLinks(db: Db, rows: readonly AuditListRow[]): Promise<AdminAuditListItem["link"][]> {
  const wanted = rows.map((row) => auditOpenLinkOf(row.action, row.entityType, row.entityId));
  const ids: Record<AuditLookupType, string[]> = { user: [], role: [] };
  for (const link of wanted) if (link) ids[link.lookup.type].push(link.lookup.id);
  const [user, role] = await Promise.all([ids.user.length ? existingUserIds(db, ids.user) : new Set<string>(), ids.role.length ? existingRoleIds(db, ids.role) : new Set<string>()]);
  const exists = { user, role };
  return wanted.map((link) => (link && exists[link.lookup.type].has(link.lookup.id) ? { kind: link.kind, path: link.path, permission: link.permission } : null));
}

/** A Gregorian `YYYY-MM-DD` day's start in Asia/Tehran, as an instant. */
const dayStart = (day: string) => new Date(joinInstant(day, "00:00")!);
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** From is inclusive from 00:00 and To inclusive to 24:00 of that Tehran day, so To is read as the start of the day after. */
function toFilter(query: AdminAuditListQuery): AuditFilter {
  return {
    ...(query.q ? { q: query.q } : {}),
    ...(query.group ? { actionKeys: auditKeysOfGroup(query.group) } : {}),
    ...(query.actor ? { actor: query.actor } : {}),
    ...(query.from ? { from: dayStart(query.from) } : {}),
    ...(query.to ? { until: dayStart(nextDay(query.to)) } : {}),
  };
}

const keyOf = (row: AuditListRow) => ({ createdAt: row.createdAtKey, id: row.id });

/**
 * One page of audit events, newest first, 20 at a time (21 are read to know whether more exist). A cursor
 * that cannot be decoded, or that leads to an empty page, restarts at the newest events. Page position is by
 * key, so events written while browsing never repeat. Read-only: viewing the log writes no audit event.
 */
export async function listAuditLog({ db }: { db: Db }, query: AdminAuditListQuery = {}): Promise<AdminAuditList> {
  const boundary = query.cursor ? decodeAuditCursor(query.cursor) : null;
  const filter = toFilter(query);
  let rows = await listAuditEvents(db, AUDIT_PAGE_SIZE + 1, boundary, filter);
  let from = boundary;
  if (boundary && rows.length === 0) {
    from = null;
    rows = await listAuditEvents(db, AUDIT_PAGE_SIZE + 1, null, filter);
  }
  // Read newest-first from the start or after a Next boundary the extra row is the last; before a Previous boundary it is the first.
  const more = rows.length > AUDIT_PAGE_SIZE;
  const towardNewer = from?.direction === "previous";
  const page = more ? (towardNewer ? rows.slice(1) : rows.slice(0, AUDIT_PAGE_SIZE)) : rows;
  const first = page[0];
  const last = page[page.length - 1];
  const hasOlder = from?.direction === "previous" ? page.length > 0 : more;
  const hasNewer = from === null ? false : from.direction === "previous" ? more : page.length > 0;
  const links = await resolveLinks(db, page);
  return {
    items: page.map((row, index) => ({ ...toItem(row), link: links[index] ?? null })),
    nextCursor: hasOlder && last ? encodeAuditCursor("next", keyOf(last)) : null,
    previousCursor: hasNewer && first ? encodeAuditCursor("previous", keyOf(first)) : null,
  };
}

/** One event in full. A well-formed id that names no event is a 404. */
export async function getAuditEvent({ db }: { db: Db }, id: string): Promise<AdminAuditEvent> {
  const row = await findAuditEvent(db, id);
  if (!row) throw new DomainError(404, "Not Found", "not_found");
  return { id: row.id, createdAt: row.createdAt.toISOString(), action: row.action, outcome: row.outcome, reason: row.reason, actor: toActor(row), entityType: row.entityType, entityId: row.entityId, correlationId: row.correlationId, summary: row.changeSummary };
}

/** The Actor select's options: Users with at least one event. */
export async function listAuditActorOptions({ db }: { db: Db }): Promise<AdminAuditActors> {
  return { items: await listAuditActors(db) };
}
