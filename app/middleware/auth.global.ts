import { AUTH_SESSION_KEY } from "~/composables/useAuthSession";
import { isSignInPath, pathLocale, signInUrl } from "~~/shared/utils/return-path";
import { isPrivatePagePath } from "~~/shared/utils/route-rules";
import type { SessionPayload } from "~~/shared/utils/session-state";

// In-app navigation to a private page without a session goes to sign-in. The server middleware
// (`server/middleware/20.private-route-guard.ts`) is the authority for the first load and runs before this on the
// server; this only covers client-side navigation, where no request reaches the server. It can only deny.
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;
  if (!isPrivatePagePath(to.path) || isSignInPath(to.path)) return;

  const client = useNuxtApp().$queryClient;
  let session = client.getQueryData<SessionPayload>(AUTH_SESSION_KEY);
  if (!session) {
    session = await client
      .fetchQuery({ queryKey: AUTH_SESSION_KEY, queryFn: () => $fetch<SessionPayload>("/api/v1/auth/session", { headers: { accept: "application/json" } }), staleTime: Infinity })
      .catch(() => undefined);
  }
  if (session && !session.loggedIn) return navigateTo(signInUrl(to.fullPath, pathLocale(to.path)));
});
