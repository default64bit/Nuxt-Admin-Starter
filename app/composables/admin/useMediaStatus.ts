import { useQuery } from "@tanstack/vue-query";
import type { MediaStatus } from "~~/shared/schemas/media";

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

/**
 * Whether media storage is configured (the Optional piece is On). An image field is disabled with a hint, and a
 * thumbnail falls back to a placeholder, until this answers `enabled: true`.
 */
export function useMediaStatus() {
  const query = useQuery({
    queryKey: ["admin", "media", "status"] as const,
    queryFn: () => request("/api/v1/admin/media/status", { headers: { accept: "application/json" } }) as Promise<MediaStatus>,
    enabled: import.meta.client,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { enabled: computed(() => query.data.value?.enabled === true), settled: computed(() => !query.isPending.value) };
}
