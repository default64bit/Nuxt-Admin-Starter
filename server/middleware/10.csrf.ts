import { assertCsrf } from "../utils/csrf";

// Request-origin guard for every state-changing `/api/v1` call (ADR-0023). `nuxt-security`'s token
// CSRF stays off because it cannot work on shared-cached pages.
export default defineEventHandler((event) => {
  // A blank site URL only occurs outside production (validated at startup); use the request's own.
  const siteOrigin = useRuntimeConfig(event).public.siteUrl || getRequestURL(event).origin;
  assertCsrf(event, siteOrigin);
});
