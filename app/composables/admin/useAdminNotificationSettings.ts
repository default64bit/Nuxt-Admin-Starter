import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { NotificationSettings, NotificationSettingsSaveBody } from "~~/shared/schemas/admin-notification-settings";

export const ADMIN_NOTIFICATION_SETTINGS_KEY = ["admin", "notification-settings"] as const;
const URL = "/api/v1/admin/account/notification-settings";

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

/** The User's own Channels and Message language. Read-only, never polled. */
export function useAdminNotificationSettings() {
  return useQuery({
    queryKey: ADMIN_NOTIFICATION_SETTINGS_KEY,
    queryFn: () => request(URL, { headers: { accept: "application/json" } }) as Promise<NotificationSettings>,
    // Client-only: a server-side run has no session cookie.
    enabled: import.meta.client,
    staleTime: 0,
    retry: false,
  });
}

/** A save returns the settings as they are now, which replaces the cached ones. */
export function useSaveNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationSettingsSaveBody) => request(URL, { method: "PUT", body }) as Promise<NotificationSettings>,
    onSuccess: (saved) => queryClient.setQueryData(ADMIN_NOTIFICATION_SETTINGS_KEY, saved),
  });
}
