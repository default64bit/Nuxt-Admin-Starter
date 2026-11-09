// @vitest-environment node
import { createApp, eventHandler, toWebHandler } from "h3";
import { describe, expect, it } from "vitest";
import apiErrorHandler from "../../../server/error-handler";
import { parseQuery } from "../../../server/utils/parse-query";
import { ADMIN_PAGE_SIZE, adminListQuerySchema, pageOffset } from "../../../shared/schemas/admin-list";

function call(search: string) {
  const app = createApp({ onError: async (error, event) => void (await apiErrorHandler(error, event)) });
  app.use("/api/v1/admin/list", eventHandler((event) => parseQuery(event, adminListQuerySchema)));
  return toWebHandler(app)(new Request(`http://x/api/v1/admin/list${search}`));
}

describe("admin list query (page and q)", () => {
  it("defaults to page 1 with no search text", async () => {
    expect(await (await call("")).json()).toEqual({ page: 1 });
  });

  it("parses page and trims q", async () => {
    expect(await (await call("?page=3&q=%20abc%20")).json()).toEqual({ page: 3, q: "abc" });
  });

  it("treats a blank q as absent", async () => {
    expect(await (await call("?q=%20%20")).json()).toEqual({ page: 1 });
  });

  for (const bad of ["page=0", "page=-1", "page=abc", "page=1.5", `q=${"x".repeat(201)}`]) {
    it(`rejects ${bad.slice(0, 12)} with 400 validation_failed and fieldErrors`, async () => {
      const res = await call(`?${bad}`);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.data.code).toBe("validation_failed");
      expect(Object.keys(body.data.fieldErrors)).toHaveLength(1);
    });
  }

  it("uses a fixed page size of 20 and computes the offset", () => {
    expect(ADMIN_PAGE_SIZE).toBe(20);
    expect(pageOffset(1)).toBe(0);
    expect(pageOffset(3)).toBe(40);
  });
});
