import sharp, { type Metadata } from "sharp";
import { MEDIA_MAX_UPLOAD_BYTES } from "../../shared/constants/media";
import { notDecodable, tooLarge, tooManyPixels, unsupportedType } from "./domain-errors";
import type { MediaImageOptions } from "../../shared/utils/media-image";

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export const MAX_UPLOAD_BYTES = MEDIA_MAX_UPLOAD_BYTES;
const MAX_SIDE = 8000;
const MAX_PIXELS = 40_000_000;
const OUTPUT_LONGEST_SIDE = 2400;
const EXTENSIONS: Record<ImageMime, "jpg" | "png" | "webp"> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The real type from the first bytes. The claimed `Content-Type` is never consulted. */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((byte, index) => bytes[index] === byte)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: ImageMime;
  ext: "jpg" | "png" | "webp";
  width: number;
  height: number;
}

/**
 * Validates and normalizes an uploaded image (.specs/media/spec.md): sniffs the real type (JPEG, PNG,
 * WebP only), refuses animation, fully decodes it, refuses more than 8000 px on a side or 40
 * megapixels, then re-encodes it in the same format with the EXIF orientation applied, all
 * metadata (EXIF, GPS) dropped and the longest side capped at 2400 px.
 */
export async function processImage(input: Buffer, longestSide: number = OUTPUT_LONGEST_SIDE): Promise<ProcessedImage> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw tooLarge();
  const mimeType = sniffImageType(input);
  if (!mimeType) throw unsupportedType();

  let metadata: Metadata;
  try {
    metadata = await sharp(input, { animated: true, limitInputPixels: false }).metadata();
  } catch {
    throw notDecodable();
  }
  if ((metadata.pages ?? 1) > 1) throw unsupportedType();
  const { width = 0, height = 0 } = metadata;
  if (width < 1 || height < 1) throw notDecodable();
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) throw tooManyPixels();

  try {
    // `rotate()` with no angle applies and then removes the EXIF orientation; no `withMetadata()`
    // call means the output carries no EXIF/GPS/ICC data.
    const pipeline = sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: longestSide, height: longestSide, fit: "inside", withoutEnlargement: true });
    const formatted = mimeType === "image/jpeg" ? pipeline.jpeg({ quality: 90 }) : mimeType === "image/png" ? pipeline.png() : pipeline.webp({ quality: 90 });
    const { data, info } = await formatted.toBuffer({ resolveWithObject: true });
    return { buffer: data, mimeType, ext: EXTENSIONS[mimeType], width: info.width, height: info.height };
  } catch {
    throw notDecodable();
  }
}

/**
 * One storefront variant of a stored image: resized to the
 * requested box (never enlarged) and re-encoded, WebP by default. The input is an already processed
 * public object, so its type, size and metadata were checked at upload.
 */
export async function renderImageVariant(input: Buffer, options: MediaImageOptions): Promise<{ buffer: Buffer; contentType: string }> {
  let pipeline = sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS });
  let { width, height } = options;
  const fit = options.fit ?? "cover";
  if (width && height && fit === "cover") {
    // A crop box larger than the original keeps its shape and shrinks to fit inside it, so the
    // variant is the largest crop of that shape; `withoutEnlargement` alone would drop the crop.
    const source = await pipeline.metadata();
    const scale = Math.min(1, (source.width ?? width) / width, (source.height ?? height) / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }
  if (width || height) {
    pipeline = pipeline.resize({
      width,
      height,
      fit,
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: options.format === "jpeg" ? 1 : 0 },
    });
  }
  if (options.format === "jpeg") pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: options.quality, mozjpeg: true });
  else if (options.format === "png") pipeline = pipeline.png({ compressionLevel: 9 });
  else pipeline = pipeline.webp({ quality: options.quality, effort: 4 });
  return { buffer: await pipeline.toBuffer(), contentType: `image/${options.format}` };
}
