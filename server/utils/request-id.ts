import { randomUUID } from "node:crypto";
import { getRequestHeader, setResponseHeader, type H3Event } from "h3";

export const REQUEST_ID_HEADER = "x-request-id";

// Accept ids a caller or proxy plausibly generated (UUIDs, ULIDs, trace ids); anything else is
// replaced so a client cannot inject newlines or oversized values into logs and headers.
const WELL_FORMED = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/;

export function isWellFormedRequestId(value: unknown): value is string {
  return typeof value === "string" && WELL_FORMED.test(value);
}

export function resolveRequestId(inbound: unknown): string {
  return isWellFormedRequestId(inbound) ? inbound : randomUUID();
}

/** Resolve the id for this request, expose it to handlers and logs, and echo it on the response. */
export function attachRequestId(event: H3Event): string {
  const requestId = resolveRequestId(getRequestHeader(event, REQUEST_ID_HEADER));
  event.context.requestId = requestId;
  setResponseHeader(event, REQUEST_ID_HEADER, requestId);
  return requestId;
}
