import { createError, getMethod, getRequestHeader, type H3Event } from "h3";
import { isApiV1Path } from "./api-error";

/**
 * Request-origin CSRF guard (ADR-0023). Nothing here depends on a per-request token or cookie, so it
 * behaves identically for pages served from the shared cache.
 */

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * `/api/v1` paths that must accept cross-site calls (provider POST callbacks). Empty in the Starter; a
 * Project that adds a provider callback adds its exact path here with a spec change.
 */
export const CSRF_EXEMPT_PATHS: readonly string[] = [];

/**
 * Routes that accept a non-JSON body (the admin media upload sends raw bytes). Exact path and method
 * only; the origin check still applies to them, so a cross-site form cannot reach one.
 */
export const CSRF_BINARY_ROUTES: readonly { method: string; path: string }[] = [{ method: "POST", path: "/api/v1/admin/media" }];

export type CsrfRejection = { statusCode: 403; code: "csrf_rejected" } | { statusCode: 415; code: "unsupported_media_type" };

export interface CsrfRequest {
  method: string;
  path: string;
  /** Lower-case header name to value. */
  headers: Record<string, string | undefined>;
  /** The configured site origin, e.g. `https://app.example`. */
  siteOrigin: string;
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin === "null" ? null : url.origin;
  } catch {
    return null;
  }
}

function hasBody(headers: CsrfRequest["headers"]): boolean {
  const length = headers["content-length"];
  if (length !== undefined) return Number(length) > 0;
  return headers["transfer-encoding"] !== undefined;
}

function isJson(contentType: string | undefined): boolean {
  return /^application\/json\s*(;|$)/i.test(contentType ?? "");
}

export function evaluateCsrf(request: CsrfRequest): CsrfRejection | null {
  const method = request.method.toUpperCase();
  if (!STATE_CHANGING.has(method) || !isApiV1Path(request.path)) return null;
  const pathname = request.path.split(/[?#]/, 1)[0] ?? "";
  if (CSRF_EXEMPT_PATHS.includes(pathname)) return null;

  const fetchSite = request.headers["sec-fetch-site"]?.toLowerCase();
  const origin = request.headers.origin;
  if (fetchSite !== undefined) {
    if (fetchSite !== "same-origin" && fetchSite !== "none") return { statusCode: 403, code: "csrf_rejected" };
  } else if (origin !== undefined) {
    const requestOrigin = originOf(origin);
    if (requestOrigin === null || requestOrigin !== originOf(request.siteOrigin)) return { statusCode: 403, code: "csrf_rejected" };
  } else {
    return { statusCode: 403, code: "csrf_rejected" };
  }

  if (CSRF_BINARY_ROUTES.some((route) => route.method === method && route.path === pathname)) return null;

  const declaresContent = hasBody(request.headers) || request.headers["content-type"] !== undefined;
  if (declaresContent && !isJson(request.headers["content-type"])) return { statusCode: 415, code: "unsupported_media_type" };
  return null;
}

/** Throws the standard 403/415 error when the request fails the guard. */
export function assertCsrf(event: H3Event, siteOrigin: string): void {
  const headers: CsrfRequest["headers"] = {};
  for (const name of ["sec-fetch-site", "origin", "content-type", "content-length", "transfer-encoding"]) {
    headers[name] = getRequestHeader(event, name);
  }
  const rejection = evaluateCsrf({ method: getMethod(event), path: event.path, headers, siteOrigin });
  if (!rejection) return;
  throw createError({
    statusCode: rejection.statusCode,
    statusMessage: rejection.statusCode === 403 ? "Forbidden" : "Unsupported Media Type",
    data: { code: rejection.code },
  });
}
