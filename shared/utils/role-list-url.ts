/** The Roles list's URL state (`q`, `page`): what the page reads and writes in the query string. */
export interface RoleListState {
  q?: string;
  page: number;
}

const first = (value: unknown): string | undefined => {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === "string" ? single : undefined;
};

/** Reads the URL query; an unknown or invalid value is dropped (the client never sends it to the API). */
export function parseRoleListUrl(query: Record<string, unknown>): RoleListState {
  const page = Number(first(query.page));
  const q = first(query.q)?.trim();
  const state: RoleListState = { page: Number.isInteger(page) && page >= 1 ? page : 1 };
  if (q) state.q = q.slice(0, 200);
  return state;
}

/** The URL query for a state: only what differs from the defaults (no search, page 1). */
export function buildRoleListUrlQuery(state: RoleListState): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.q) query.q = state.q;
  if (state.page > 1) query.page = String(state.page);
  return query;
}
