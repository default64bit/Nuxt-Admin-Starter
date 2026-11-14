// @vitest-environment node
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readLimited } from "../../../server/utils/read-limited-body";

const chunks = (...sizes: number[]) => Readable.from(sizes.map((size) => Buffer.alloc(size, 7)));

describe("readLimited", () => {
  it("returns the whole body when it fits", async () => {
    const body = await readLimited(chunks(400, 600), 1000);
    expect(body.byteLength).toBe(1000);
  });

  it("answers too_large (413) as soon as the declared length is over the limit, without reading", async () => {
    let read = false;
    const stream = (async function* () {
      read = true;
      yield Buffer.alloc(1);
    })();
    await expect(readLimited(stream, 1000, 1001)).rejects.toMatchObject({ statusCode: 413, data: { code: "too_large" } });
    expect(read).toBe(false);
  });

  it("stops at the limit while streaming even when no length was declared or the header lied", async () => {
    await expect(readLimited(chunks(600, 600), 1000)).rejects.toMatchObject({ statusCode: 413, data: { code: "too_large" } });
    await expect(readLimited(chunks(600, 600), 1000, 10)).rejects.toMatchObject({ statusCode: 413 });
  });

  it("accepts a body of exactly the limit", async () => {
    expect((await readLimited(chunks(1000), 1000)).byteLength).toBe(1000);
  });

  it("returns an empty buffer for an empty body", async () => {
    expect((await readLimited(Readable.from([]), 1000)).byteLength).toBe(0);
  });
});
