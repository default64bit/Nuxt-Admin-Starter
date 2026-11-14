/**
 * Resized-image URLs. The public bucket holds one processed object per image (at most 2400 px on its longest side,
 * .specs/media/spec.md); `/_media/<key>?w=&h=&fit=&f=&q=` (`server/routes/_media/[...key].ts`) resizes and re-encodes it
 * to the size an `<img>` shows it at. Shared by both sides so the URL the browser asks for is the URL the server accepts.
 */

export const MEDIA_IMAGE_PATH = "/_media";

/** No variant is wider or taller than the stored original. */
export const MEDIA_IMAGE_MAX_SIDE = 2400;
export const MEDIA_IMAGE_DEFAULT_QUALITY = 75;

export const MEDIA_IMAGE_FORMATS = ["webp", "jpeg", "png"] as const;
export type MediaImageFormat = (typeof MEDIA_IMAGE_FORMATS)[number];

export const MEDIA_IMAGE_FITS = ["cover", "contain", "fill", "inside", "outside"] as const;
export type MediaImageFit = (typeof MEDIA_IMAGE_FITS)[number];

/**
 * A public-bucket object key: slash-separated plain segments ending in an image extension. No `..`,
 * no empty segment and no leading slash, so a key can never leave the public bucket's namespace.
 */
const OBJECT_KEY_PATTERN = /^[\w-]+(?:\/[\w-]+)*\.(?:jpe?g|png|webp)$/i;

export const isMediaObjectKey = (key: string): boolean => OBJECT_KEY_PATTERN.test(key);

export interface MediaImageOptions {
  width?: number;
  height?: number;
  fit?: MediaImageFit;
  format: MediaImageFormat;
  quality: number;
}

/** The query of a variant, in one fixed order so the same variant is always the same URL. */
export function mediaImageQuery(options: MediaImageOptions): string {
  const params = new URLSearchParams();
  if (options.width) params.set("w", String(options.width));
  if (options.height) params.set("h", String(options.height));
  if (options.fit && options.width && options.height) params.set("fit", options.fit);
  params.set("f", options.format);
  params.set("q", String(options.quality));
  return params.toString();
}

export function mediaImageUrl(key: string, options: Partial<MediaImageOptions> = {}): string {
  return `${MEDIA_IMAGE_PATH}/${key}?${mediaImageQuery({ format: "webp", quality: MEDIA_IMAGE_DEFAULT_QUALITY, ...(options.width && options.height ? { fit: "cover" } : {}), ...options })}`;
}
