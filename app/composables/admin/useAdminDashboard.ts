import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import type { z } from "zod";
import type { ModuleRangeKey } from "~~/shared/constants/analytics";
import type { DashboardModuleKey } from "~~/shared/constants/dashboard-modules";
import type { MODULE_PAYLOAD_SCHEMAS, ChartStyle, DashboardPreferences } from "~~/shared/schemas/admin-dashboard";

/** The Dashboard's preferences: one query for the layout, ranges and Chart style. */
export const ADMIN_DASHBOARD_KEY = ["admin", "dashboard-preferences"] as const;

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

/** Client-only: a server-side run has no session cookie, so its 401 would show the session-ended dialog. */
export function useAdminDashboardPreferences() {
  return useQuery({
    queryKey: ADMIN_DASHBOARD_KEY,
    queryFn: () => request("/api/v1/admin/account/dashboard", { headers: { accept: "application/json" } }) as Promise<DashboardPreferences>,
    enabled: import.meta.client,
    staleTime: 60_000,
    retry: false,
  });
}

/** The payload of every module, by module key: the output type of its schema in `MODULE_PAYLOAD_SCHEMAS`. */
export type DashboardModulePayloads = { [K in DashboardModuleKey]: z.output<(typeof MODULE_PAYLOAD_SCHEMAS)[K]> };

/**
 * One period module's data: it follows its range, is fresh for 60 s (the server caches for as long) unless the module
 * shows a live figure (`staleTime: 0`), refetches on focus and is never polled (ADR-0024).
 */
export function useDashboardModule<K extends DashboardModuleKey>(moduleKey: K, range: Ref<ModuleRangeKey>, staleTime = 60_000) {
  return useQuery({
    queryKey: computed(() => ["admin", "analytics", moduleKey, range.value] as const),
    queryFn: () => request(`/api/v1/admin/analytics/modules/${moduleKey}`, { query: { range: range.value }, headers: { accept: "application/json" } }) as Promise<DashboardModulePayloads[K]>,
    enabled: import.meta.client,
    staleTime,
    refetchOnWindowFocus: true,
    refetchInterval: false,
    retry: false,
  });
}

/**
 * Saves a module's range at once. The choice applies optimistically to the cached preferences; when the save
 * fails the previous preferences come back and an error toast shows (admin-dashboard spec "Range menu").
 */
export function useSaveModuleRange() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: ({ moduleKey, range }: { moduleKey: string; range: ModuleRangeKey }) =>
      request(`/api/v1/admin/account/dashboard/ranges/${moduleKey}`, { method: "PUT", body: { range } }) as Promise<{ range: ModuleRangeKey }>,
    onMutate: async ({ moduleKey, range }) => {
      await queryClient.cancelQueries({ queryKey: ADMIN_DASHBOARD_KEY });
      const previous = queryClient.getQueryData<DashboardPreferences>(ADMIN_DASHBOARD_KEY);
      if (previous) queryClient.setQueryData<DashboardPreferences>(ADMIN_DASHBOARD_KEY, { ...previous, ranges: { ...previous.ranges, [moduleKey]: range } });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(ADMIN_DASHBOARD_KEY, context.previous);
      toast.error(t("admin.dashboard.range.saveFailed"));
    },
  });
}

/**
 * Saves the Chart style at once, outside Customize too. The choice applies optimistically to the cached preferences (so
 * every chart redraws immediately); when the save fails the previous preferences come back and an error toast shows.
 */
export function useSaveChartStyle() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: ({ chartStyle }: { chartStyle: ChartStyle }) => request("/api/v1/admin/account/dashboard/chart-style", { method: "PUT", body: { chartStyle } }) as Promise<{ chartStyle: ChartStyle }>,
    onMutate: async ({ chartStyle }) => {
      await queryClient.cancelQueries({ queryKey: ADMIN_DASHBOARD_KEY });
      const previous = queryClient.getQueryData<DashboardPreferences>(ADMIN_DASHBOARD_KEY);
      if (previous) queryClient.setQueryData<DashboardPreferences>(ADMIN_DASHBOARD_KEY, { ...previous, chartStyle });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(ADMIN_DASHBOARD_KEY, context.previous);
      toast.error(t("admin.dashboard.chartStyle.saveFailed"));
    },
  });
}
