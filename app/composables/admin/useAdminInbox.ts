import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import { INBOX_POPOVER_LIMIT, type InboxList, type InboxTab } from "~~/shared/schemas/admin-notifications";
import { inboxApiQuery, type InboxUrlState } from "~~/shared/utils/inbox-url";
import { ADMIN_NAV_COUNTS_KEY } from "./useAdminNavCounts";

export const ADMIN_INBOX_KEY = ["admin", "inbox"] as const;
const BASE = "/api/v1/admin/notifications";

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

/** The Inbox page: 20 items per page, Previous and Next; the previous rows stay while another page loads. Never polled. */
export function useAdminInboxList(state: Ref<InboxUrlState>) {
  return useQuery({
    queryKey: computed(() => [...ADMIN_INBOX_KEY, "list", JSON.stringify(inboxApiQuery(state.value))] as const),
    queryFn: () => request(BASE, { query: inboxApiQuery(state.value), headers: { accept: "application/json" } }) as Promise<InboxList>,
    placeholderData: keepPreviousData,
    // Client-only: a server-side run has no session cookie.
    enabled: import.meta.client,
    staleTime: 0,
    retry: false,
  });
}

/** The Popover's newest items of one tab (Unread or Read); loaded each time it opens or the tab changes, never before. */
export function useAdminInboxPopover(open: Ref<boolean>, tab: Ref<Extract<InboxTab, "unread" | "read">>) {
  return useQuery({
    queryKey: computed(() => [...ADMIN_INBOX_KEY, "popover", tab.value] as const),
    queryFn: () => request(BASE, { query: { tab: tab.value, limit: INBOX_POPOVER_LIMIT }, headers: { accept: "application/json" } }) as Promise<InboxList>,
    enabled: computed(() => import.meta.client && open.value),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/**
 * The live Inbox's new items: the unresolved ones strictly after `after` (a wire cursor, or none), newest first. A one-off
 * fetch through the query client (never cached or shown by a list), so alerts need no query of their own.
 */
export function fetchNewInboxItems(queryClient: QueryClient, after: string | null): Promise<InboxList> {
  return queryClient.fetchQuery({
    queryKey: [...ADMIN_INBOX_KEY, "alerts", after ?? "start"] as const,
    queryFn: () => request(BASE, { query: { tab: "open", ...(after ? { after } : {}) }, headers: { accept: "application/json" } }) as Promise<InboxList>,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Read state changes, then every Inbox list and the bell count read again. */
export function useInboxMutations() {
  const queryClient = useQueryClient();
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ADMIN_INBOX_KEY }), queryClient.invalidateQueries({ queryKey: ADMIN_NAV_COUNTS_KEY })]);
  return {
    markRead: useMutation({ mutationFn: (id: string) => request(`${BASE}/${id}/read`, { method: "POST" }), onSuccess: refresh }),
    markUnread: useMutation({ mutationFn: (id: string) => request(`${BASE}/${id}/read`, { method: "DELETE" }), onSuccess: refresh }),
    /** The cutoff is the moment of the click: items that arrive later stay unread. */
    markAllRead: useMutation({ mutationFn: () => request(`${BASE}/read-all`, { method: "POST", body: { before: new Date().toISOString() } }), onSuccess: refresh }),
  };
}
