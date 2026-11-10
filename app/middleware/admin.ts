import { AUTH_SESSION_KEY } from "~/composables/useAuthSession";
import { adminRouteAccess } from "~~/shared/utils/admin-access";
import { pathLocale, signInUrl } from "~~/shared/utils/return-path";
import type { SessionPayload } from "~~/shared/utils/session-state";

// Applied by the admin parent route (`app/pages/admin.vue`), so one middleware covers `/admin`, `/en/admin` and every
// child page without ever testing the path string. A page declares the Permission that opens it with
// `definePageMeta({ permission: "view-users" })`; the Dashboard declares none.
//
// It backs the server (the private-route guard sends guests to sign-in before any render; every API route checks the
// Permission itself) and can only deny. During SSR it runs on the server render, so a missing page Permission becomes
// a real HTTP 403. Idempotent: a second run reaches the same verdict.
export default defineNuxtRouteMiddleware(async (to) => {
  const client = useNuxtApp().$queryClient;
  const requestFetch = import.meta.server ? useRequestFetch() : null;
  let session = client.getQueryData<SessionPayload>(AUTH_SESSION_KEY);
  if (!session) {
    session = await client
      .fetchQuery({
        queryKey: AUTH_SESSION_KEY,
        queryFn: () => (requestFetch ?? $fetch)<SessionPayload>("/api/v1/auth/session", { headers: { accept: "application/json" } }),
        staleTime: Infinity,
      })
      .catch(() => undefined);
  }
  const verdict = adminRouteAccess(session, to.meta.permission as string | undefined);
  if (verdict === "sign-in") return navigateTo(signInUrl(to.fullPath, pathLocale(to.path)));
  if (verdict === "forbidden") return abortNavigation(createError({ statusCode: 403, statusMessage: "Forbidden", fatal: true }));
});
