import { USER_STATUSES } from "../constants/database-enums";

/** The Users list's URL state (`q`, `status`, `role`, `page`): what the page reads and writes in the query string. */
export interface UserListState {
  q?: string;
  status?: (typeof USER_STATUSES)[number];
  /** A Role id. */
  role?: string;
  page: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const first = (value: unknown): string | undefined => {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === "string" ? single : undefined;
};

/** Reads the URL query; an unknown or invalid value is dropped (the client never sends it to the API). */
export function parseUserListUrl(query: Record<string, unknown>): UserListState {
  const page = Number(first(query.page));
  const q = first(query.q)?.trim();
  const state: UserListState = { page: Number.isInteger(page) && page >= 1 ? page : 1 };
  if (q) state.q = q.slice(0, 200);
  const status = USER_STATUSES.find((candidate) => candidate === first(query.status));
  if (status) state.status = status;
  const role = first(query.role);
  if (role && UUID.test(role)) state.role = role.toLowerCase();
  return state;
}

/** The URL query for a state: only what differs from the defaults (no search, no filter, page 1). */
export function buildUserListUrlQuery(state: UserListState): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.q) query.q = state.q;
  if (state.status) query.status = state.status;
  if (state.role) query.role = state.role;
  if (state.page > 1) query.page = String(state.page);
  return query;
}
