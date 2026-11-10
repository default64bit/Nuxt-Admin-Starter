// demo-ticket:start (whole file) -- server state of the demo tickets, through Vue Query (ADR-0011).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
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
