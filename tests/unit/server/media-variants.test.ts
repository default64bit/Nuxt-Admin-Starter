// @vitest-environment node
import { createApp, createRouter, eventHandler, toWebHandler } from "h3";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { MediaImageOptions } from "../../../shared/utils/media-image";
import { createMediaVariants, type MediaVariant } from "../../../server/services/media-variants.service";
import { renderImageVariant } from "../../../server/utils/image-processing";
import { MEDIA_VARIANT_CACHE_CONTROL, mediaVariantResponse, parseMediaVariantRequest } from "../../../server/utils/media-variant-handler";
import { MemoryStorage } from "../../integration/support/memory-storage";

const KEY = "images/0b6f0c1e-1d2a-4c55-9a40-0d6e2f1c2a11.jpg";
const WEBP: MediaImageOptions = { width: 200, format: "webp", quality: 75 };
const photo = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();

async function storageWith(key: string, body: Buffer) {
  const storage = new MemoryStorage();
  await storage.put("public", key, body, "image/jpeg");
  return storage;
}

describe("renderImageVariant", () => {
  it("resizes to the asked width, keeps the ratio and encodes WebP", async () => {
    const { buffer, contentType } = await renderImageVariant(await photo(2400, 1800), WEBP);
    expect(contentType).toBe("image/webp");
    expect(await sharp(buffer).metadata()).toMatchObject({ format: "webp", width: 200, height: 150 });
  });

  it("crops to the asked box with cover, and never enlarges past the original", async () => {
    const cropped = await renderImageVariant(await photo(1200, 800), { width: 64, height: 80, fit: "cover", format: "webp", quality: 75 });
    expect(await sharp(cropped.buffer).metadata()).toMatchObject({ width: 64, height: 80 });
    const small = await renderImageVariant(await photo(300, 200), { width: 1200, format: "webp", quality: 75 });
    expect(await sharp(small.buffer).metadata()).toMatchObject({ width: 300, height: 200 });
  });

  it("gives the largest crop of the asked shape when the box is bigger than the original", async () => {
    const { buffer } = await renderImageVariant(await photo(1254, 1254), { width: 1287, height: 1716, fit: "cover", format: "webp", quality: 75 });
    expect(await sharp(buffer).metadata()).toMatchObject({ width: 941, height: 1254 });
  });

  it("is much smaller than the stored original", async () => {
    const original = await sharp({ create: { width: 2400, height: 2400, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 40 } } }).jpeg({ quality: 90 }).toBuffer();
    const { buffer } = await renderImageVariant(original, { width: 416, format: "webp", quality: 75 });
    expect(buffer.byteLength * 10).toBeLessThan(original.byteLength);
  });
});

describe("createMediaVariants", () => {
  it("renders a variant once and serves repeats from the cache", async () => {
    const storage = await storageWith(KEY, await photo(800, 600));
    const get = vi.spyOn(storage, "get");
    const variants = createMediaVariants({ storage });
    const [first, second] = await Promise.all([variants.get(KEY, WEBP), variants.get(KEY, WEBP)]);
    const third = await variants.get(KEY, WEBP);
    expect(first).toBe(second);
    expect(third).toBe(first);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("public", KEY);
  });

  it("answers null for a missing object and caches nothing for it", async () => {
    const variants = createMediaVariants({ storage: new MemoryStorage() });
    expect(await variants.get(KEY, WEBP)).toBeNull();
    expect(variants.size()).toBe(0);
  });

  it("does not cache a failed render", async () => {
    const storage = await storageWith(KEY, Buffer.from("x"));
    const render = vi.fn<(input: Buffer, options: MediaImageOptions) => Promise<MediaVariant>>().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ buffer: Buffer.from("ok"), contentType: "image/webp" });
    const variants = createMediaVariants({ storage, render });
    await expect(variants.get(KEY, WEBP)).rejects.toThrow("boom");
    expect((await variants.get(KEY, WEBP))?.buffer.toString()).toBe("ok");
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used variants past its byte budget", async () => {
    const storage = await storageWith(KEY, Buffer.from("x"));
    const render = async (_input: Buffer, options: MediaImageOptions) => ({ buffer: Buffer.alloc(40), contentType: `image/${options.format}` });
    const variants = createMediaVariants({ storage, render, maxBytes: 100 });
    await variants.get(KEY, { ...WEBP, width: 1 });
    await variants.get(KEY, { ...WEBP, width: 2 });
    await variants.get(KEY, { ...WEBP, width: 1 });
    await variants.get(KEY, { ...WEBP, width: 3 });
    expect(variants.size()).toBe(2);
    expect(variants.bytes()).toBe(80);
    const get = vi.spyOn(storage, "get");
    await variants.get(KEY, { ...WEBP, width: 1 });
    expect(get).not.toHaveBeenCalled();
  });
});

describe("parseMediaVariantRequest", () => {
  it("defaults to WebP at the default quality, and to cover when both sides are set", () => {
    expect(parseMediaVariantRequest(KEY, { w: "200", h: "300" })).toEqual({ key: KEY, options: { width: 200, height: 300, fit: "cover", format: "webp", quality: 75 } });
    expect(parseMediaVariantRequest(KEY, { w: "200" })?.options.fit).toBeUndefined();
  });

  it.each([
    ["a side over the stored maximum", { w: "2401" }],
    ["a zero side", { w: "0" }],
    ["a fractional side", { w: "10.5" }],
    ["an unknown format", { f: "avif" }],
    ["an unknown option", { blur: "5" }],
    ["a quality over 100", { q: "101" }],
  ])("refuses %s", (_label, query) => {
    expect(parseMediaVariantRequest(KEY, query)).toBeNull();
  });

  it("refuses a key outside the public namespace", () => {
    expect(parseMediaVariantRequest("../private-bucket/staging/a.jpg", {})).toBeNull();
    expect(parseMediaVariantRequest(undefined, {})).toBeNull();
  });
});

describe("the /_media route", () => {
  async function handler() {
    const storage = await storageWith(KEY, await photo(800, 600));
    const variants = createMediaVariants({ storage });
    const router = createRouter().use("/_media/**:key", eventHandler((event) => mediaVariantResponse(event, variants)));
    return toWebHandler(createApp().use(router));
  }

  it("serves a WebP variant that every cache may keep for good", async () => {
    const response = await (await handler())(new Request(`http://app.test/_media/${KEY}?w=200&f=webp&q=75`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe(MEDIA_VARIANT_CACHE_CONTROL);
    expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ format: "webp", width: 200 });
  });

  it("answers a plain 404 for a missing object and a plain 400 for a bad request, never cached for good", async () => {
    const serve = await handler();
    const missing = await serve(new Request("http://app.test/_media/images/missing.jpg?w=200"));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toContain("text/plain");
    expect(missing.headers.get("cache-control")).toBe("public, max-age=60");
    const bad = await serve(new Request(`http://app.test/_media/${KEY}?w=99999`));
    expect(bad.status).toBe(400);
    expect(bad.headers.get("cache-control")).toBe("no-store");
  });

  it("answers HEAD like GET and refuses other methods", async () => {
    const serve = await handler();
    const head = await serve(new Request(`http://app.test/_media/${KEY}?w=200`, { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe("image/webp");
    const post = await serve(new Request(`http://app.test/_media/${KEY}?w=200`, { method: "POST" }));
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
  });
});
