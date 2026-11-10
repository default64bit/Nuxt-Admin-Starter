import { MutationCache, QueryCache, QueryClient, VueQueryPlugin, dehydrate, hydrate, type DehydratedState } from "@tanstack/vue-query";
import { AUTH_SESSION_KEY } from "~/composables/useAuthSession";
import { parseApiError } from "~~/shared/utils/api-error-client";
import { GUEST_SESSION } from "~~/shared/utils/session-state";
import { isSignInPath, pathLocale, signInUrl } from "~~/shared/utils/return-path";

/** Never retry a client error (a 401 fires no further request); one retry for anything transient. */
const shouldRetry = (failureCount: number, error: unknown) => {
  const status = parseApiError(error).status;
  if (status !== null && status >= 400 && status < 500) return false;
  return failureCount < 1;
};

export default defineNuxtPlugin((nuxtApp) => {
  // Created inside the plugin invocation so SSR requests never share a cache.
  // A 401 `unauthenticated` from any `/api/v1` call other than the sign-in endpoints means the session ended
  // (idle 30 minutes, 12 hours in total, signed out elsewhere, or the account was disabled): the app flips to
  // the guest state once and sends the person to sign-in with a clear message and the page to come back to.
  const onError = (error: unknown) => {
    if (import.meta.server) return;
    const parsed = parseApiError(error);
    if (parsed.status !== 401 || parsed.code !== "unauthenticated") return;
    nuxtApp.runWithContext(() => {
      const path = window.location.pathname;
      if (isSignInPath(path)) return;
      queryClient.setQueryData(AUTH_SESSION_KEY, GUEST_SESSION);
      return navigateTo(signInUrl(`${path}${window.location.search}`, pathLocale(path), "session-ended"));
    });
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    // No polling or focus refetch by default.
    defaultOptions: { queries: { retry: shouldRetry, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });

  // Queries that ran during SSR (the session on private pages) travel in the payload. Shared-cached pages never
  // run the session query on the server, so nothing about a visitor is embedded in them.
  if (import.meta.server) {
    nuxtApp.hooks.hook("app:rendered", () => {
      nuxtApp.payload.vueQueryState = dehydrate(queryClient);
    });
  } else if (nuxtApp.payload.vueQueryState) {
    hydrate(queryClient, nuxtApp.payload.vueQueryState as DehydratedState);
  }

  return { provide: { queryClient } };
});
