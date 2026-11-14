import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { isPrivatePagePath } from "~~/shared/utils/route-rules";
import { GUEST_SESSION, deriveSessionState, type SessionPayload, type SessionState } from "~~/shared/utils/session-state";

export const AUTH_SESSION_KEY = ["auth", "session"] as const;

/**
 * The browser's one view of the session, derived from `GET /api/v1/auth/session` through Vue Query.
 * On private (uncached) pages it is fetched during SSR and hydrated, so the first response already has it; on
 * shared-cached pages the server never fetches it (the HTML must be identical for every visitor) and the client
 * reads it once after hydration. No polling or focus refetch.
 */
export function useAuthSession() {
  const route = useRoute();
  const requestFetch = import.meta.server ? useRequestFetch() : null;
  const enabled = import.meta.client || isPrivatePagePath(route.path);

  const query = useQuery({
    queryKey: AUTH_SESSION_KEY,
    queryFn: () => (requestFetch ?? $fetch)<SessionPayload>("/api/v1/auth/session", { headers: { accept: "application/json" } }),
    enabled,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // Registered on the server AND the client (it never runs on the client): Vue's useId() adds a path segment to
  // every component with a server-prefetch hook, so a server-only registration would make this component and its
  // descendants generate different ids than the client (hydration id mismatches).
  onServerPrefetch(async () => {
    if (enabled) await query.suspense();
  });

  const state = computed<SessionState>(() => deriveSessionState({ data: query.data.value, isError: query.isError.value }));

  return {
    state,
    session: query.data,
    user: computed(() => query.data.value?.user ?? null),
    isLoading: computed(() => state.value === "loading"),
    isGuest: computed(() => state.value === "guest"),
    isSignedIn: computed(() => state.value === "user"),
    refresh: () => query.refetch(),
  };
}

/** Write access to the session cache for sign-in and sign-out; consumers update without a reload. */
export function useSessionCache() {
  const queryClient = useQueryClient();
  return {
    /** Seeds the cache from the verify response so the UI flips to signed-in at once. */
    setSession: (payload: SessionPayload) => queryClient.setQueryData(AUTH_SESSION_KEY, payload),
    clear: () => queryClient.setQueryData(AUTH_SESSION_KEY, GUEST_SESSION),
    invalidate: () => queryClient.invalidateQueries({ queryKey: AUTH_SESSION_KEY }),
  };
}

/** Sign-out: POST logout (idempotent, 204), then the cache flips to guest. Not retried. */
export function useSignOut() {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: () => postJson<null>("/api/v1/auth/logout", {}),
    onSuccess: () => cache.clear(),
    retry: false,
  });
}
