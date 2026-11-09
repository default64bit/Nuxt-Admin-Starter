// @vitest-environment node
import { createApp, eventHandler, toWebHandler } from "h3";
import { describe, expect, it } from "vitest";
import apiErrorHandler from "../../../server/error-handler";
import { CSRF_EXEMPT_PATHS, assertCsrf, evaluateCsrf, type CsrfRequest } from "../../../server/utils/csrf";

const SITE = "https://app.example";
const REJECTED = { statusCode: 403, code: "csrf_rejected" };

function check(overrides: Partial<CsrfRequest> & { headers?: CsrfRequest["headers"] }) {
  return evaluateCsrf({
    method: "POST",
    path: "/api/v1/auth/logout",
    siteOrigin: SITE,
    ...overrides,
    headers: { "content-type": "application/json", "content-length": "2", ...overrides.headers },
  });
}

describe("evaluateCsrf", () => {
  it("passes same-origin JSON requests", () => {
    expect(check({ headers: { "sec-fetch-site": "same-origin" } })).toBeNull();
    expect(check({ headers: { "sec-fetch-site": "none" } })).toBeNull();
    expect(check({ headers: { origin: SITE } })).toBeNull();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects a cross-site Origin on %s", (method) => {
    expect(check({ method, headers: { origin: "https://evil.example" } })).toEqual(REJECTED);
  });

  it("rejects when neither Sec-Fetch-Site nor Origin is present", () => {
    expect(check({ headers: {} })).toEqual(REJECTED);
  });

  it.each(["cross-site", "same-site", "bogus"])("rejects Sec-Fetch-Site %s", (value) => {
    expect(check({ headers: { "sec-fetch-site": value, origin: SITE } })).toEqual(REJECTED);
  });

  it("rejects Origin: null, malformed origins and look-alike hosts", () => {
    for (const origin of ["null", "not a url", "https://app.example.evil.com", "http://app.example"]) {
      expect(check({ headers: { origin } }), origin).not.toBeNull();
    }
  });

  it("rejects a body that is not JSON, but lets a bodyless request through", () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", undefined]) {
      expect(check({ headers: { "sec-fetch-site": "same-origin", "content-type": type, "content-length": "5" } }), String(type)).toEqual({
        statusCode: 415,
        code: "unsupported_media_type",
      });
    }
    expect(evaluateCsrf({ method: "DELETE", path: "/api/v1/x", siteOrigin: SITE, headers: { "sec-fetch-site": "same-origin", "content-length": "0" } })).toBeNull();
  });

  it("never blocks safe methods or non-API paths", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(evaluateCsrf({ method, path: "/api/v1/x", siteOrigin: SITE, headers: { origin: "https://evil.example" } })).toBeNull();
    }
    expect(evaluateCsrf({ method: "POST", path: "/", siteOrigin: SITE, headers: {} })).toBeNull();
    expect(evaluateCsrf({ method: "POST", path: "/api/health/live", siteOrigin: SITE, headers: {} })).toBeNull();
  });

  it("ships an empty provider-callback allowlist", () => {
    expect(CSRF_EXEMPT_PATHS).toEqual([]);
  });

  it("accepts a raw body only on the media upload route, and still checks the origin there", () => {
    const upload = (over: Partial<CsrfRequest> = {}) =>
      evaluateCsrf({
        method: "POST",
        path: "/api/v1/admin/media?purpose=ticket",
        siteOrigin: SITE,
        headers: { "sec-fetch-site": "same-origin", "content-type": "image/jpeg", "content-length": "1000" },
        ...over,
      });
    expect(upload()).toBeNull();
    expect(upload({ headers: { "sec-fetch-site": "cross-site", "content-type": "image/jpeg", "content-length": "1000" } })).toEqual(REJECTED);
    expect(upload({ path: "/api/v1/admin/other" })).toEqual({ statusCode: 415, code: "unsupported_media_type" });
    expect(upload({ method: "PUT" })).toEqual({ statusCode: 415, code: "unsupported_media_type" });
  });
});

describe("assertCsrf through the API error handler", () => {
  const handle = toWebHandler(
    (() => {
      const app = createApp({ onError: apiErrorHandler as never });
      app.use(
        eventHandler((event) => {
          assertCsrf(event, SITE);
          return { ok: true };
        }),
      );
      return app;
    })(),
  );

  it("answers a cross-site POST with the standard error body", async () => {
    const response = await handle(
      new Request("http://x/api/v1/thing", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ statusCode: 403, statusMessage: "Forbidden", data: { code: "csrf_rejected" } });
  });

  it("passes a same-origin DELETE and any GET", async () => {
    expect((await handle(new Request("http://x/api/v1/thing", { method: "DELETE", headers: { origin: SITE } }))).status).toBe(200);
    expect((await handle(new Request("http://x/api/v1/thing", { headers: { origin: "https://evil.example" } }))).status).toBe(200);
  });
});
