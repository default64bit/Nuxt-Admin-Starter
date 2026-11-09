import { buildCsp, extractInlineHashes, reportingFromDsn } from "../utils/csp";

// Content-hash CSP for every HTML response (ADR-0022). It runs on `beforeResponse` rather than
// `render:response` because nuxt-security moves its plugins after ours and its SRI plugin still
// rewrites the body, so only here is the body final. A shared-cached page is hashed again from the
// same cached bytes and therefore always gets a matching policy. `nuxt-security`'s own CSP is off.
export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig();
  const reporting = reportingFromDsn(config.public.glitchtipDsn);
  const upgradeInsecureRequests = !config.public.siteUrl.startsWith("http://");

  nitroApp.hooks.hook("beforeResponse", (event, response) => {
    const contentType = getResponseHeader(event, "content-type");
    if (typeof contentType !== "string" || !contentType.toLowerCase().includes("text/html")) return;
    if (typeof response.body !== "string") return;

    setResponseHeader(
      event,
      "content-security-policy",
      buildCsp(extractInlineHashes(response.body), {
        mediaOrigin: config.public.mediaBaseUrl,
        errorOrigin: reporting?.origin,
        reportUri: reporting?.reportUri,
        dev: import.meta.dev,
        upgradeInsecureRequests,
      }),
    );
  });
});
