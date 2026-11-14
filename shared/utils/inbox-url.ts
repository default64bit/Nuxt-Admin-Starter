import type { InboxTab } from "../schemas/admin-notifications";
import { ATTENTION_TYPE_KEYS, type AttentionType } from "../constants/notification-catalog";

/** The Inbox page's URL state; only Unread and All are tabs. Pages of 20 with Previous and Next. */
export interface InboxUrlState {
  tab: Extract<InboxTab, "unread" | "all">;
  type?: AttentionType;
  page: number;
}

const first = (value: unknown): string | undefined => {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === "string" ? single : undefined;
};

/** Reads the URL query; an unknown or invalid value is dropped. */
export function parseInboxUrl(query: Record<string, unknown>): InboxUrlState {
  const tab = first(query.tab) === "all" ? "all" : "unread";
  const type = ATTENTION_TYPE_KEYS.find((candidate) => candidate === first(query.type));
  const page = Number.parseInt(first(query.page) ?? "1", 10);
  return { tab, ...(type ? { type } : {}), page: Number.isInteger(page) && page > 1 ? page : 1 };
}

/** Only what differs from the defaults (Unread, every type, first page). */
export function buildInboxUrlQuery(state: InboxUrlState): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.tab !== "unread") query.tab = state.tab;
  if (state.type) query.type = state.type;
  if (state.page > 1) query.page = String(state.page);
  return query;
}

/** The API query always names the tab. */
export const inboxApiQuery = (state: InboxUrlState): Record<string, string> => ({ ...buildInboxUrlQuery(state), tab: state.tab, page: String(state.page) });
