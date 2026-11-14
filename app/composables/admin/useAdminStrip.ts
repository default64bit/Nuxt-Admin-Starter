import { useQuery } from "@tanstack/vue-query";
import type { UsersStrip } from "~~/shared/schemas/admin-users-strip";

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

/** The Users strip's figures: fresh for 60 s (the server caches for as long), refetched on focus, never polled. */
export function useUsersStrip() {
  return useQuery({
    queryKey: ["admin", "analytics", "strips", "users"] as const,
    queryFn: () => request("/api/v1/admin/analytics/strips/users", { headers: { accept: "application/json" } }) as Promise<UsersStrip>,
    // Client-only: a server-side run has no session cookie.
    enabled: import.meta.client,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
