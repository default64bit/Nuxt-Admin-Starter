import { getQuery, getRouterParam, setResponseHeader, setResponseStatus, type H3Event } from "h3";
import { z } from "zod";
import {
  isMediaObjectKey,
  MEDIA_IMAGE_DEFAULT_QUALITY,
  MEDIA_IMAGE_FITS,
  MEDIA_IMAGE_FORMATS,
  MEDIA_IMAGE_MAX_SIDE,
  type MediaImageOptions,
} from "../../shared/utils/media-image";
import type { MediaVariant } from "../services/media-variants.service";
import { requestLogger } from "./logger";

/** Public keys are random and never rewritten (.specs/media/spec.md), so a variant can be cached for good. */
export const MEDIA_VARIANT_CACHE_CONTROL = "public, max-age=31536000, immutable";
const MISS_CACHE_CONTROL = "public, max-age=60";

const side = z.coerce.number().int().min(1).max(MEDIA_IMAGE_MAX_SIDE).optional();
const variantQuery = z
  .object({
    w: side,
    h: side,
    fit: z.enum(MEDIA_IMAGE_FITS).optional(),
    f: z.enum(MEDIA_IMAGE_FORMATS).default("webp"),
    q: z.coerce.number().int().min(1).max(100).default(MEDIA_IMAGE_DEFAULT_QUALITY),
  })
  .strict();

/** Parses `/_media/<key>?w=&h=&fit=&f=&q=`; null for a key outside the public namespace or an unknown option. */
export function parseMediaVariantRequest(key: string | undefined, query: Record<string, unknown>): { key: string; options: MediaImageOptions } | null {
  if (!key || !isMediaObjectKey(key)) return null;
  const parsed = variantQuery.safeParse(query);
  if (!parsed.success) return null;
  const { w, h, fit, f, q } = parsed.data;
  return { key, options: { width: w, height: h, fit: w && h ? (fit ?? "cover") : undefined, format: f, quality: q } };
}

/**
 * Serves one image variant. Errors answer a short plain-text body rather than the Nuxt
 * error page: an `<img>` cannot show HTML, and rendering a page per broken image would cost more
 * than the image.
 */
export async function mediaVariantResponse(event: H3Event, variants: { get: (key: string, options: MediaImageOptions) => Promise<MediaVariant | null> }) {
  if (event.method !== "GET" && event.method !== "HEAD") {
    setResponseHeader(event, "allow", "GET, HEAD");
    return plain(event, 405, "Method not allowed", "no-store");
  }
  const request = parseMediaVariantRequest(getRouterParam(event, "key", { decode: true }), getQuery(event));
  if (!request) return plain(event, 400, "Bad request", "no-store");
  let variant: MediaVariant | null;
  try {
    variant = await variants.get(request.key, request.options);
  } catch (error) {
    requestLogger(event).error("media variant failed", { key: request.key, error: error instanceof Error ? error.name : "unknown" });
    return plain(event, 502, "Image unavailable", "no-store");
  }
  if (!variant) return plain(event, 404, "Not found", MISS_CACHE_CONTROL);
  setResponseHeader(event, "content-type", variant.contentType);
  setResponseHeader(event, "cache-control", MEDIA_VARIANT_CACHE_CONTROL);
  return variant.buffer;
}

/** The variant route while media storage is Off. */
export function mediaNotConfiguredResponse(event: H3Event) {
  return plain(event, 503, "Media storage is not configured", "no-store");
}

function plain(event: H3Event, status: number, message: string, cacheControl: string) {
  setResponseStatus(event, status);
  setResponseHeader(event, "content-type", "text/plain; charset=utf-8");
  setResponseHeader(event, "cache-control", cacheControl);
  return message;
}
