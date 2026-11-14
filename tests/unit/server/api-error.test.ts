// @vitest-environment node
import { createApp, createError, eventHandler, toWebHandler } from "h3";
import { describe, expect, it } from "vitest";
import apiErrorHandler from "../../../server/error-handler";
import { isApiV1Path, toApiErrorBody } from "../../../server/utils/api-error";

describe("toApiErrorBody", () => {
  it("follows { statusCode, statusMessage, data: { code, fieldErrors? } }", () => {
    const error = createError({
      statusCode: 422,
      statusMessage: "Validation failed",
      data: { code: "validation-failed", fieldErrors: { phone: ["Invalid phone number"] } },
    });
    expect(toApiErrorBody(error)).toEqual({
      statusCode: 422,
      statusMessage: "Validation failed",
      data: { code: "validation-failed", fieldErrors: { phone: ["Invalid phone number"] } },
    });
  });

  it("derives a stable code from the status when none is given", () => {
    expect(toApiErrorBody(createError({ statusCode: 404 })).data.code).toBe("not-found");
    expect(toApiErrorBody(createError({ statusCode: 401 })).data.code).toBe("unauthenticated");
    expect(toApiErrorBody(createError({ statusCode: 403 })).data.code).toBe("forbidden");
  });

  it("never leaks internals of a server error", () => {
    const body = toApiErrorBody(new Error('relation "users" does not exist at /srv/app/db.ts'));
    expect(body).toEqual({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      data: { code: "internal-error" },
    });
    const withMessage = toApiErrorBody(
      createError({ statusCode: 503, statusMessage: "select * from secrets", data: { stack: "x" } }),
    );
    expect(JSON.stringify(withMessage)).not.toContain("secrets");
    expect(withMessage.data).toEqual({ code: "internal-error" });
  });

  it("carries a positive integer retryAfter and ignores anything else", () => {
    const body = (retryAfter: unknown) =>
      toApiErrorBody(createError({ statusCode: 429, data: { code: "otp_rate_limited", retryAfter } }));
    expect(body(42)).toEqual({
      statusCode: 429,
      statusMessage: "Too Many Requests",
      data: { code: "otp_rate_limited", retryAfter: 42 },
    });
    for (const bad of [0, -1, 1.5, "10", null]) expect(body(bad).data).toEqual({ code: "otp_rate_limited" });
  });

  it("drops malformed fieldErrors", () => {
    const body = toApiErrorBody(
      createError({ statusCode: 400, data: { fieldErrors: { a: "not-an-array", b: ["ok"] } } }),
    );
    expect(body.data.fieldErrors).toEqual({ b: ["ok"] });
  });

  it("recognises /api/v1 paths only", () => {
    expect(isApiV1Path("/api/v1/tickets?x=1")).toBe(true);
    expect(isApiV1Path("/api/v1")).toBe(true);
    expect(isApiV1Path("/api/v10")).toBe(false);
    expect(isApiV1Path("/admin")).toBe(false);
  });
});

describe("API error handler contract", () => {
  function handler() {
    const app = createApp({ onError: apiErrorHandler as never });
    app.use(eventHandler((event) => {
      if (event.path === "/api/v1/missing") {
        throw createError({ statusCode: 404, data: { code: "not-found" } });
      }
      throw new Error("db exploded");
    }));
    return toWebHandler(app);
  }

  it("answers a thrown 404 with the standard body, private and uncached", async () => {
    const response = await handler()(new Request("http://x/api/v1/missing"));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      statusCode: 404,
      statusMessage: "Not Found",
      data: { code: "not-found" },
    });
  });

  it("hides an unexpected failure behind a generic 500", async () => {
    const response = await handler()(new Request("http://x/api/v1/boom"));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("db exploded");
    expect(JSON.parse(text)).toEqual({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      data: { code: "internal-error" },
    });
  });
});
