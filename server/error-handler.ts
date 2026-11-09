import { send, setResponseHeader, setResponseStatus, type H3Event } from "h3";
import { isApiV1Path, toApiErrorBody } from "./utils/api-error";
import { requestLogger } from "./utils/logger";

// First link in Nitro's error-handler chain (registered in `nuxt.config.ts`). It answers `/api/v1`
// errors with the standard JSON body and leaves everything else (pages, health) unhandled so Nuxt
// renders its own error page.
export default async function apiErrorHandler(error: unknown, event: H3Event) {
  if (!isApiV1Path(event.path)) return;

  const body = toApiErrorBody(error);
  if (body.statusCode >= 500) {
    const message = error instanceof Error ? error.message : "unknown error";
    requestLogger(event).error("api request failed", { statusCode: body.statusCode, error: message });
  }

  setResponseStatus(event, body.statusCode, body.statusMessage);
  setResponseHeader(event, "cache-control", "private, no-store");
  if (body.data.retryAfter) setResponseHeader(event, "retry-after", body.data.retryAfter);
  return send(event, JSON.stringify(body), "application/json; charset=utf-8");
}
