import { useDocumentVisibility } from "@vueuse/core";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import type { AdminNavCounts } from "~~/shared/schemas/admin-nav-counts";
import { parseApiError } from "~~/shared/utils/api-error-client";
import { diffNavCounts, navPollDelay, NAV_POLL_MS, type NavCountsChange, type NavQueueCountKey } from "~~/shared/utils/admin-live-inbox";

export const ADMIN_NAV_COUNTS_KEY = ["admin", "nav-counts"] as const;
/** How long a count is fresh: focus and navigation refetch only after this. */
export const NAV_COUNTS_STALE_MS = 30_000;
export { NAV_POLL_MS };

/** The Popover lists and the Inbox page. */
export const LIVE_INBOX_KEY = ["admin", "inbox"] as const;
/**
 * The list query of each queue whose count a poll saw change (list keys only: a detail page's query is never in the
 * set). A Project adds one row per queue, next to its `NAV_QUEUE_COUNT_KEYS` name.
 */
export const LIVE_QUEUE_LIST_KEYS: Record<NavQueueCountKey, readonly string[]> = {
  // demo-ticket:start
  openDemoTickets: ["admin", "demo-tickets", "list"],
  // demo-ticket:end
};

// Untyped alias: Nitro's generated route typings are too deep to infer for this call.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

// Consecutive failed answers per client: Vue Query resets its own failure count whenever a fetch starts.
const failures = new WeakMap<QueryClient, number>();

type ChangeHandler = (change: NavCountsChange) => void;
const changeHandlers = new Set<ChangeHandler>();

/**
 * The live Inbox's change hook. `handler` runs after every successful nav-counts answer (a poll, a focus or navigation
 * refetch, or one a mutation caused): `change.previous` is null for the tab's first answer (its baseline), otherwise
 * `change.changed` says whether `newest` moved or any count differs. Returns the unsubscribe function.
 */
export function onAdminNavCountsChange(handler: ChangeHandler): () => void {
  changeHandlers.add(handler);
  return () => changeHandlers.delete(handler);
}

/** Refetches (in the background, same keys, so no dimming or skeleton) what the change makes stale. Detail pages are untouched. */
export function refreshForNavCountsChange(queryClient: QueryClient, change: NavCountsChange): void {
  if (!change.changed) return;
  const keys: (readonly string[])[] = [];
  if (change.newestMoved || change.unreadChanged) keys.push(LIVE_INBOX_KEY);
  for (const queue of change.changedQueues) keys.push(LIVE_QUEUE_LIST_KEYS[queue]);
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}

/**
 * The counts behind the menu badges and the bell, and the live Inbox's heartbeat: one shared query, fetched when the
 * admin layout mounts, refetched on window focus and on navigation once older than 30 seconds, and polled every 20
 * seconds while the tab is visible (hidden tabs never poll). A failed poll is silent, backs off to 40 s, 80 s and at
 * most 2 minutes, and keeps the last good counts. A 401 (handled once for the app by the Vue Query plugin) stops polling.
 * A first fetch that fails leaves no data, so no badge shows.
 */
export function useAdminNavCounts(wanted: Ref<boolean>) {
  const route = useRoute();
  const queryClient = useQueryClient();
  const visibility = useDocumentVisibility();
  const stopped = ref(false);
  const polling = computed(() => import.meta.client && wanted.value && visibility.value === "visible" && !stopped.value);

  const query = useQuery({
    queryKey: ADMIN_NAV_COUNTS_KEY,
    queryFn: async () => {
      let counts: AdminNavCounts;
      try {
        counts = (await request("/api/v1/admin/nav-counts", { headers: { accept: "application/json" }, retry: 0 })) as AdminNavCounts;
      } catch (error) {
        if (parseApiError(error).status === 401) stopped.value = true;
        failures.set(queryClient, (failures.get(queryClient) ?? 0) + 1);
        throw error;
      }
      failures.set(queryClient, 0);
      const change = diffNavCounts(queryClient.getQueryData<AdminNavCounts>(ADMIN_NAV_COUNTS_KEY), counts);
      refreshForNavCountsChange(queryClient, change);
      for (const handler of changeHandlers) {
        try {
          handler(change);
        } catch {
          // A broken listener never fails the poll.
        }
      }
      return counts;
    },
    // Client-only: a server-side run has no session cookie.
    enabled: computed(() => import.meta.client && wanted.value),
    staleTime: NAV_COUNTS_STALE_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
    refetchInterval: () => (polling.value ? navPollDelay(failures.get(queryClient) ?? 0) : false),
    retry: false,
  });

  const refetchNow = () => {
    if (wanted.value) void queryClient.refetchQueries({ queryKey: ADMIN_NAV_COUNTS_KEY }, { cancelRefetch: false });
  };
  // Back in view: poll at once; the interval restarts from that fetch.
  watch(visibility, (state) => {
    if (state === "visible" && polling.value) refetchNow();
  });
  watch(
    () => route.fullPath,
    () => {
      if (wanted.value) void queryClient.refetchQueries({ queryKey: ADMIN_NAV_COUNTS_KEY, stale: true });
    },
  );
  // The last good answer stays through a failed poll.
  return { counts: computed<Partial<AdminNavCounts>>(() => query.data.value ?? {}), refetchNow };
}

/** For mutations that change a count (a ticket move, an assignment): refetch the badges now. */
export function useInvalidateNavCounts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ADMIN_NAV_COUNTS_KEY });
}
