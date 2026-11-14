import { mediaImageQuery, type MediaImageOptions } from "../../shared/utils/media-image";
import { renderImageVariant } from "../utils/image-processing";
import type { ObjectStorage } from "../utils/object-storage";

export interface MediaVariant {
  buffer: Buffer;
  contentType: string;
}

export interface MediaVariantDeps {
  storage: ObjectStorage;
  render?: (input: Buffer, options: MediaImageOptions) => Promise<MediaVariant>;
  /** The cache holds at most this many bytes of encoded variants; the least recently used go first. */
  maxBytes?: number;
}

/** A missing object: the S3 client names it `NoSuchKey` (HTTP 404); the test store throws that message. */
const isMissingObject = (error: unknown): boolean => {
  const failure = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } } | null;
  return failure?.name === "NoSuchKey" || failure?.message === "NoSuchKey" || failure?.$metadata?.httpStatusCode === 404;
};

/**
 * Image variants: reads one public object,
 * resizes and re-encodes it, and keeps the result in a small in-process LRU so a popular card image
 * is encoded once per process, not once per visitor. Public keys are random and never rewritten, so
 * a variant never goes stale. Concurrent requests for one variant share one render; a failure or a
 * missing object is never cached.
 */
export function createMediaVariants({ storage, render = renderImageVariant, maxBytes = 64 * 1024 * 1024 }: MediaVariantDeps) {
  // Map keeps insertion order: the first key is the least recently used.
  const entries = new Map<string, MediaVariant>();
  const pending = new Map<string, Promise<MediaVariant | null>>();
  let bytes = 0;

  function store(id: string, variant: MediaVariant) {
    if (variant.buffer.byteLength > maxBytes) return;
    entries.set(id, variant);
    bytes += variant.buffer.byteLength;
    while (bytes > maxBytes) {
      const [oldest, evicted] = entries.entries().next().value as [string, MediaVariant];
      entries.delete(oldest);
      bytes -= evicted.buffer.byteLength;
    }
  }

  async function produce(id: string, key: string, options: MediaImageOptions): Promise<MediaVariant | null> {
    let original: Buffer;
    try {
      original = await storage.get("public", key);
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
    const variant = await render(original, options);
    store(id, variant);
    return variant;
  }

  /** The variant of the public object `key`, or null when there is no such object. */
  function get(key: string, options: MediaImageOptions): Promise<MediaVariant | null> {
    const id = `${key}?${mediaImageQuery(options)}`;
    const cached = entries.get(id);
    if (cached) {
      // Recently used: move to the end.
      entries.delete(id);
      entries.set(id, cached);
      return Promise.resolve(cached);
    }
    const running = pending.get(id);
    if (running) return running;
    const started = produce(id, key, options).finally(() => pending.delete(id));
    pending.set(id, started);
    return started;
  }

  return { get, size: () => entries.size, bytes: () => bytes };
}

let variants: ReturnType<typeof createMediaVariants> | undefined;

/** The app's variant cache, built once on the app's object store. */
export function useMediaVariants(storage: ObjectStorage) {
  variants ??= createMediaVariants({ storage });
  return variants;
}
