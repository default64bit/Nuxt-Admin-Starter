// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { DomainError } from "../../../server/utils/domain-errors";
import { processImage, sniffImageType } from "../../../server/utils/image-processing";

const canvas = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } });
const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as DomainError;
  }
  throw new Error("expected a rejection");
};

describe("sniffImageType", () => {
  it("reads JPEG, PNG and WebP from the bytes, whatever the claimed type", async () => {
    expect(sniffImageType(await canvas(8, 8).jpeg().toBuffer())).toBe("image/jpeg");
    expect(sniffImageType(await canvas(8, 8).png().toBuffer())).toBe("image/png");
    expect(sniffImageType(await canvas(8, 8).webp().toBuffer())).toBe("image/webp");
  });

  it("knows nothing else: GIF, text, an empty body", async () => {
    expect(sniffImageType(Buffer.from("GIF89a....."))).toBeNull();
    expect(sniffImageType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("processImage", () => {
  it.each([
    ["image/jpeg", "jpg", (s: sharp.Sharp) => s.jpeg()],
    ["image/png", "png", (s: sharp.Sharp) => s.png()],
    ["image/webp", "webp", (s: sharp.Sharp) => s.webp()],
  ] as const)("keeps %s and reports the processed size", async (mimeType, ext, encode) => {
    const result = await processImage(await encode(canvas(300, 200)).toBuffer());
    expect(result).toMatchObject({ mimeType, ext, width: 300, height: 200 });
    expect(result.buffer.byteLength).toBeGreaterThan(0);
    expect(sniffImageType(result.buffer)).toBe(mimeType);
  });

  it("caps the longest side at 2400 px, keeping the aspect ratio, and never enlarges", async () => {
    const big = await processImage(await canvas(3000, 1000).jpeg().toBuffer());
    expect([big.width, big.height]).toEqual([2400, 800]);
    const tall = await processImage(await canvas(1000, 3000).jpeg().toBuffer());
    expect([tall.width, tall.height]).toEqual([800, 2400]);
    const small = await processImage(await canvas(100, 50).jpeg().toBuffer());
    expect([small.width, small.height]).toEqual([100, 50]);
  });

  it("strips all metadata (EXIF, GPS) from the stored bytes", async () => {
    const withExif = await canvas(64, 64).jpeg().withExif({ IFD0: { Copyright: "secret owner", Artist: "someone" } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const result = await processImage(withExif);
    expect((await sharp(result.buffer).metadata()).exif).toBeUndefined();
    expect(result.buffer.includes(Buffer.from("secret owner"))).toBe(false);
  });

  it("applies the EXIF orientation before stripping it", async () => {
    const rotated = await canvas(100, 50).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await processImage(rotated);
    expect([result.width, result.height]).toEqual([50, 100]);
  });

  it("rejects a file that is not a JPEG, PNG or WebP image as unsupported_type (415)", async () => {
    for (const body of [Buffer.from("GIF89a....."), Buffer.from("MZ executable"), Buffer.alloc(0)]) {
      const error = await rejection(processImage(body));
      expect([error.statusCode, error.data.code]).toEqual([415, "unsupported_type"]);
    }
  });

  it("rejects an animated image as unsupported_type", async () => {
    const animated = await sharp([await canvas(16, 16).png().toBuffer(), await canvas(16, 16).negate().png().toBuffer()], { join: { animated: true } })
      .webp({ delay: [100, 100], loop: 0 })
      .toBuffer();
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
    const error = await rejection(processImage(animated));
    expect(error.data.code).toBe("unsupported_type");
  });

  it("rejects bytes that look like an image but do not decode as not_decodable (422)", async () => {
    const jpeg = await canvas(200, 200).jpeg().toBuffer();
    const truncated = jpeg.subarray(0, 300);
    for (const body of [truncated, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("not really jpeg data")])]) {
      const error = await rejection(processImage(body));
      expect([error.statusCode, error.data.code]).toEqual([422, "not_decodable"]);
    }
  });

  it("rejects more than 8000 px on a side or more than 40 megapixels as too_many_pixels (422)", async () => {
    const wide = await canvas(8001, 4).png().toBuffer();
    const area = await canvas(7000, 6000).png().toBuffer(); // 42 MP, each side within 8000
    for (const body of [wide, area]) {
      const error = await rejection(processImage(body));
      expect([error.statusCode, error.data.code]).toEqual([422, "too_many_pixels"]);
    }
    await expect(processImage(await canvas(8000, 4).png().toBuffer())).resolves.toBeDefined();
  });

  it("rejects a body over 10 MiB as too_large (413)", async () => {
    const error = await rejection(processImage(Buffer.alloc(10 * 1024 * 1024 + 1, 1)));
    expect([error.statusCode, error.data.code]).toEqual([413, "too_large"]);
  });
});
