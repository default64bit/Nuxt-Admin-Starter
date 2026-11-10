import { send, setResponseHeader, setResponseStatus, type H3Event } from "h3";
import { PRIVATE_CACHE_CONTROL, isPrivatePagePath } from "../shared/utils/route-rules";
import { recordRefusedAdminAttempt } from "./utils/admin-attempts";
import { isApiV1Path, toApiErrorBody } from "./utils/api-error";
import { requestLogger } from "./utils/logger";

/**
 * The framework's error renderer writes `cache-control: no-cache` after this chain's first link (and
 * always for a 404), which would make a private page's error cacheable. Pin the header at the moment
 * the response head is written, so the error pages of private routes (the admin 404 in particular)
 * stay `private, no-store` (ADR-0013).
 */
function pinPrivateCacheControl(event: H3Event) {
  const res = event.node.res;
  if (res.headersSent) return;
  const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => unknown;
  (res as { writeHead: unknown }).writeHead = (...args: unknown[]) => {
    const last = args[args.length - 1];
    if (last && typeof last === "object" && !Array.isArray(last)) delete (last as Record<string, unknown>)["cache-control"];
    if (!res.headersSent) res.setHeader("cache-control", PRIVATE_CACHE_CONTROL);
    return writeHead(...args);
  };
}

// First link in Nitro's error-handler chain (registered in `nuxt.config.ts`). It answers `/api/v1`
// errors with the standard JSON body and leaves everything else (pages, health) unhandled so Nuxt
// renders its own error page; the error pages of private routes keep `private, no-store`.
export default async function apiErrorHandler(error: unknown, event: H3Event) {
  if (!isApiV1Path(event.path)) {
    if (isPrivatePagePath(event.path)) pinPrivateCacheControl(event);
    return;
  }

  const body = toApiErrorBody(error);
  if (body.statusCode >= 500) {
    const message = error instanceof Error ? error.message : "unknown error";
    requestLogger(event).error("api request failed", { statusCode: body.statusCode, error: message });
  }

  // A signed-in User refused on a mutating admin route leaves a best-effort `denied` audit event; it never changes the answer.
  if (body.statusCode === 403 || body.statusCode === 409) await recordRefusedAdminAttempt(event, body);

  setResponseStatus(event, body.statusCode, body.statusMessage);
  setResponseHeader(event, "cache-control", "private, no-store");
  if (body.data.retryAfter) setResponseHeader(event, "retry-after", body.data.retryAfter);
  return send(event, JSON.stringify(body), "application/json; charset=utf-8");
}
