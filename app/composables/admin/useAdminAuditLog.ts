import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import type { AdminAuditActors, AdminAuditEvent, AdminAuditList } from "~~/shared/schemas/admin-audit-log";
import { buildAuditListUrlQuery, type AuditListState } from "~~/shared/utils/audit-list-url";

export const ADMIN_AUDIT_LOG_KEY = ["admin", "audit-log"] as const;
const BASE = "/api/v1/admin/audit-log";

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

/** One page of audit events for the filters and cursor (none = the newest, unfiltered). The previous page stays while the next loads. Never polled. */
export function useAdminAuditLog(state: Ref<AuditListState>) {
  return useQuery({
    queryKey: computed(() => [...ADMIN_AUDIT_LOG_KEY, "list", JSON.stringify(buildAuditListUrlQuery(state.value))] as const),
    queryFn: () => request(BASE, { query: buildAuditListUrlQuery(state.value), headers: { accept: "application/json" } }) as Promise<AdminAuditList>,
    placeholderData: keepPreviousData,
    // Client-only: a server-side run has no session cookie, so its 401 would flip the session state in the rendered page.
    enabled: import.meta.client,
    staleTime: 0,
    retry: false,
  });
}

/** One event in full, fetched the first time its card opens and kept for the page (events are immutable). */
export function useAdminAuditEvent(id: Ref<string>, enabled: Ref<boolean>) {
  return useQuery({
    queryKey: computed(() => [...ADMIN_AUDIT_LOG_KEY, "event", id.value] as const),
    queryFn: () => request(`${BASE}/${id.value}`, { headers: { accept: "application/json" } }) as Promise<AdminAuditEvent>,
    enabled: computed(() => import.meta.client && enabled.value),
    staleTime: Infinity,
    retry: false,
  });
}

/** The Actor select's options; they change rarely, so they are kept for the page. */
export function useAdminAuditActors() {
  return useQuery({
    queryKey: [...ADMIN_AUDIT_LOG_KEY, "actors"] as const,
    queryFn: () => request(`${BASE}/actors`, { headers: { accept: "application/json" } }) as Promise<AdminAuditActors>,
    enabled: import.meta.client,
    staleTime: 60_000,
    retry: false,
  });
}
