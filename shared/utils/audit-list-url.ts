import { AUDIT_GROUPS, type AuditGroup } from "../constants/audit-actions";

/** The Audit log page's URL state (.specs/audit-log/spec.md "Filters" and "Cursor paging"). */
export interface AuditListState {
  /** An exact entity id or request id. */
  q?: string;
  group?: AuditGroup;
  /** A user id or `system`. */
  actor?: string;
  /** Gregorian `YYYY-MM-DD` days in Asia/Tehran. */
  from?: string;
  to?: string;
  cursor?: string;
}

/** The query keys this state owns; any other key in the URL is left alone. */
export const AUDIT_URL_KEYS = ["q", "group", "actor", "from", "to", "cursor"] as const;

const first = (value: unknown): string | undefined => {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === "string" ? single : undefined;
};

const realDay = (value: string | undefined): string | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : undefined;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the URL query; an invalid value (unknown group, an actor that is neither a uuid nor `system`, a malformed day) is dropped. */
export function parseAuditListUrl(query: Record<string, unknown>): AuditListState {
  const state: AuditListState = {};
  const q = first(query.q)?.trim();
  if (q) state.q = q.slice(0, 100);
  const group = AUDIT_GROUPS.find((candidate) => candidate === first(query.group));
  if (group) state.group = group;
  const actor = first(query.actor);
  if (actor && (actor === "system" || UUID.test(actor))) state.actor = actor;
  const from = realDay(first(query.from));
  const to = realDay(first(query.to));
  if (from) state.from = from;
  if (to) state.to = to;
  const cursor = first(query.cursor);
  if (cursor && cursor.length <= 1024 && /^[A-Za-z0-9_-]+$/.test(cursor)) state.cursor = cursor;
  return state;
}

/** The URL query for a state: only what is set. */
export function buildAuditListUrlQuery(state: AuditListState): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of AUDIT_URL_KEYS) if (state[key]) query[key] = state[key] as string;
  return query;
}

/** Whether any search or filter is active (the cursor is not one). */
export const hasAuditFilters = (state: AuditListState): boolean => Boolean(state.q || state.group || state.actor || state.from || state.to);
