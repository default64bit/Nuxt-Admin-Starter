import type { H3Event } from "h3";
import { getResponseHeader, getResponseStatus, removeResponseHeader, setResponseHeader } from "h3";
import { NOINDEX, PRIVATE_CACHE_CONTROL } from "../../shared/utils/route-rules";
import { REQUEST_ID_HEADER } from "./request-id";
import { requestLogger } from "./logger";

export interface HttpPolicyRules {
  apiCacheControlFor: (path: string) => string | null;
  isSharedCachedPagePath: (path: string) => boolean;
  isPrivatePagePath: (path: string) => boolean;
}

function varyWithoutCookie(value: string): string | undefined {
  const kept = value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token && token.toLowerCase() !== "cookie");
  return kept.length > 0 ? kept.join(", ") : undefined;
}

/**
 * Last line of defence for the cache-header invariants (ADR-0013), applied to the outgoing response so
 * a forgetful handler cannot make a private response cacheable or a cached page per-visitor.
 */
export function applyHttpPolicy(event: H3Event, rules: HttpPolicyRules): void {
  // 1. Every response is traceable, including one replayed from a cache.
  if (event.context.requestId) setResponseHeader(event, REQUEST_ID_HEADER, String(event.context.requestId));

  // 2. `/api/v1` is private unless allowlisted.
  const apiPolicy = rules.apiCacheControlFor(event.path);
  if (apiPolicy) {
    const isPublic = apiPolicy.startsWith("public");
    if (isPublic && getResponseStatus(event) < 400) {
      // Allowlisted reads: the route rule supplies the default, a handler may tighten it.
      if (!getResponseHeader(event, "cache-control")) setResponseHeader(event, "cache-control", apiPolicy);
    } else {
      setResponseHeader(event, "cache-control", PRIVATE_CACHE_CONTROL);
    }
    return;
  }

  // 3. A private page is never cacheable and never indexed, whatever renders it: Nuxt's error renderer
  //    replaces the route rule's headers (for example on the admin address's 404), and route rules do
  //    not match a path written in another letter case.
  if (rules.isPrivatePagePath(event.path)) {
    setResponseHeader(event, "cache-control", PRIVATE_CACHE_CONTROL);
    setResponseHeader(event, "x-robots-tag", NOINDEX);
    return;
  }

  // 4. A shared-cached page carries nothing per visitor.
  if (rules.isSharedCachedPagePath(event.path)) {
    const log = requestLogger(event);
    if (getResponseHeader(event, "set-cookie")) {
      removeResponseHeader(event, "set-cookie");
      log.warn("stripped set-cookie from a shared-cached page", { path: event.path });
    }
    const vary = getResponseHeader(event, "vary");
    if (typeof vary === "string" && /\bcookie\b/i.test(vary)) {
      const next = varyWithoutCookie(vary);
      if (next) setResponseHeader(event, "vary", next);
      else removeResponseHeader(event, "vary");
      log.warn("stripped cookie from Vary on a shared-cached page", { path: event.path });
    }
  }
}
