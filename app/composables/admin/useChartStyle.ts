import type { ChartStyle } from "~~/shared/schemas/admin-dashboard";
import { useAdminDashboardPreferences } from "./useAdminDashboard";

/**
 * The signed-in admin's Chart style, read from the one preferences query every chart shares (so a change in the picker
 * redraws every chart at once). Soft until the preferences arrive.
 */
export function useChartStyle() {
  const preferences = useAdminDashboardPreferences();
  return computed<ChartStyle>(() => (preferences.data.value?.chartStyle ?? "soft"));
}
