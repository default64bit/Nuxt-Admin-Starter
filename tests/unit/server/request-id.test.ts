// @vitest-environment node
import { createApp, eventHandler, toWebHandler } from "h3";
import { describe, expect, it } from "vitest";
import {
  REQUEST_ID_HEADER,
  attachRequestId,
  isWellFormedRequestId,
  resolveRequestId,
} from "../../../server/utils/request-id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("request id", () => {
  it("accepts well-formed ids", () => {
    for (const id of ["0b9f6d0e-5c2a-4a54-9a63-1f3d2c4b5a69", "01HZX3ABCDEF", "req_123.abc-XYZ"]) {
      expect(isWellFormedRequestId(id)).toBe(true);
      expect(resolveRequestId(id)).toBe(id);
    }
  });

  it("replaces malformed ids", () => {
    for (const bad of [undefined, "", "short", "has space in it", "line\nbreak-123456", "x".repeat(65), "<script>alert(1)</script>", "-leading-dash-1"]) {
      expect(isWellFormedRequestId(bad)).toBe(false);
      expect(resolveRequestId(bad)).toMatch(UUID);
    }
  });

  it("echoes the id on the response and exposes it to handlers", async () => {
    const app = createApp();
    app.use(eventHandler((event) => {
      attachRequestId(event);
      return { seen: event.context.requestId };
    }));
    const handle = toWebHandler(app);

    const kept = await handle(new Request("http://x/", { headers: { [REQUEST_ID_HEADER]: "client-supplied-1" } }));
    expect(kept.headers.get(REQUEST_ID_HEADER)).toBe("client-supplied-1");
    expect(await kept.json()).toEqual({ seen: "client-supplied-1" });

    const replaced = await handle(new Request("http://x/", { headers: { [REQUEST_ID_HEADER]: "bad id" } }));
    expect(replaced.headers.get(REQUEST_ID_HEADER)).toMatch(UUID);
  });
});
