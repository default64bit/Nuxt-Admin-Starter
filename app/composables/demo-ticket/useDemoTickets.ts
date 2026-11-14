// demo-ticket:start (whole file) -- server state of the demo tickets, through Vue Query (ADR-0011).
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/vue-query";
import type { DemoTicketStatus } from "~~/shared/constants/demo-ticket";
import type { DemoTicketAssigneeList, DemoTicketCreateBody, DemoTicketList, DemoTicketRow, DemoTicketUpdateBody } from "~~/shared/schemas/demo-ticket";
import { demoTicketApiQuery, type DemoTicketListState } from "~~/shared/utils/demo-ticket-list-url";

export const DEMO_TICKETS_KEY = ["admin", "demo-tickets"] as const;
const BASE = "/api/v1/admin/demo-tickets";

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

/** One page of the list; the previous rows stay while the next page or filter loads. */
export function useDemoTicketsList(state: Ref<DemoTicketListState>) {
  return useQuery({
    queryKey: computed(() => [...DEMO_TICKETS_KEY, "list", JSON.stringify(demoTicketApiQuery(state.value))] as const),
    queryFn: () => request(BASE, { query: demoTicketApiQuery(state.value), headers: { accept: "application/json" } }) as Promise<DemoTicketList>,
    placeholderData: keepPreviousData,
    // Client-only: a server-side run has no session cookie, so its 401 would flip the session state in the server-rendered page.
    enabled: import.meta.client,
    staleTime: 0,
    retry: false,
  });
}

/** What the Board shares with the list: the search and the filters (never the page). */
export type DemoTicketBoardFilters = Pick<DemoTicketListState, "q" | "status" | "priority" | "assignee">;
const boardFilterQuery = (filters: DemoTicketBoardFilters) => demoTicketApiQuery({ ...filters, page: 1 });
export const demoTicketBoardKey = (status: DemoTicketStatus, filters: DemoTicketBoardFilters) => [...DEMO_TICKETS_KEY, "board", status, JSON.stringify(boardFilterQuery(filters))] as const;

/**
 * One Board column: the tickets in `status` under the list's search and filters, 20 at a time (the next 20 on "Show
 * more"). With a status filter only that column loads. Refetched on window focus and after the User's own moves.
 */
export function useDemoTicketBoardColumn(status: DemoTicketStatus, filters: Ref<DemoTicketBoardFilters>) {
  return useInfiniteQuery({
    queryKey: computed(() => demoTicketBoardKey(status, filters.value)),
    queryFn: ({ pageParam }) => request(BASE, { query: { ...boardFilterQuery(filters.value), status, page: pageParam }, headers: { accept: "application/json" } }) as Promise<DemoTicketList>,
    initialPageParam: 1,
    getNextPageParam: (last: DemoTicketList) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    enabled: computed(() => import.meta.client && (!filters.value.status || filters.value.status === status)),
    staleTime: 0,
    retry: false,
  });
}

type BoardData = InfiniteData<DemoTicketList, number>;

/**
 * Moves a ticket between two cached Board columns at once (the optimistic part of a move) and returns how to undo it.
 * The source loses the ticket from whichever page holds it; the target's first page gains it, newest first.
 */
export function useOptimisticDemoTicketMove() {
  const queryClient = useQueryClient();
  return (ticket: DemoTicketRow, to: DemoTicketStatus, filters: DemoTicketBoardFilters): (() => void) => {
    const sourceKey = demoTicketBoardKey(ticket.status, filters);
    const targetKey = demoTicketBoardKey(to, filters);
    const before = { source: queryClient.getQueryData<BoardData>(sourceKey), target: queryClient.getQueryData<BoardData>(targetKey) };
    if (!before.source) return () => {};
    queryClient.setQueryData<BoardData>(sourceKey, { ...before.source, pages: before.source.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== ticket.id), total: Math.max(0, page.total - 1) })) });
    const [first, ...rest] = before.target?.pages ?? [];
    if (before.target && first) {
      const moved: DemoTicketRow = { ...ticket, status: to, statusSince: new Date().toISOString() };
      const items = [...first.items.filter((item) => item.id !== ticket.id), moved].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      queryClient.setQueryData<BoardData>(targetKey, { ...before.target, pages: [{ ...first, items, total: first.total + 1 }, ...rest.map((page) => ({ ...page, total: page.total + 1 }))] });
    }
    return () => {
      queryClient.setQueryData(sourceKey, before.source);
      queryClient.setQueryData(targetKey, before.target);
    };
  };
}

/** One ticket, for the dialog a `?ticket=<id>` link opens (it may be on any page of the list). */
export function useDemoTicket(id: Ref<string | undefined>) {
  return useQuery({
    queryKey: computed(() => [...DEMO_TICKETS_KEY, "one", id.value ?? ""] as readonly unknown[]),
    queryFn: () => request(`${BASE}/${id.value}`, { headers: { accept: "application/json" } }) as Promise<DemoTicketRow>,
    enabled: computed(() => import.meta.client && Boolean(id.value)),
    refetchOnMount: "always",
    staleTime: 0,
    retry: false,
  });
}

/** The active Users a ticket can be assigned to. */
export function useDemoTicketAssignees() {
  return useQuery({
    queryKey: [...DEMO_TICKETS_KEY, "assignees"] as const,
    queryFn: () => request(`${BASE}/assignees`, { headers: { accept: "application/json" } }) as Promise<DemoTicketAssigneeList>,
    enabled: import.meta.client,
    staleTime: 60_000,
    retry: false,
  });
}

/** The write actions. Every success refetches the lists and the open ticket; errors surface to the dialog, which maps the code. */
export function useDemoTicketMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: DEMO_TICKETS_KEY });
  return {
    create: useMutation({ mutationFn: (body: DemoTicketCreateBody) => request(BASE, { method: "POST", body }) as Promise<DemoTicketRow>, onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<DemoTicketUpdateBody> & Pick<DemoTicketUpdateBody, "expectedUpdatedAt"> }) => request(`${BASE}/${id}`, { method: "PATCH", body }) as Promise<DemoTicketRow>, onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => request(`${BASE}/${id}`, { method: "DELETE" }), onSuccess: refresh }),
  };
}
// demo-ticket:end
