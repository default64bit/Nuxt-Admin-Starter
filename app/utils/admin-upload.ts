/** The browser side of the admin image upload (.specs/media/spec.md): raw file to the media route, with progress, cancel and at most three at once. */

import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_UPLOAD_BYTES, type MediaPurpose } from "~~/shared/constants/media";
import type { UploadedMedia } from "~~/shared/schemas/media";

export class UploadError extends Error {
  constructor(
    readonly code: string | null,
    readonly status: number | null,
    readonly network = false,
    readonly aborted = false,
  ) {
    super(code ?? (aborted ? "aborted" : network ? "network" : "upload_failed"));
    this.name = "UploadError";
  }
}


/** Fast client feedback only: the server re-checks the real type and size and decides. */
export function precheckImage(file: Pick<File, "type" | "size">): "unsupported_type" | "too_large" | null {
  if (!(MEDIA_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) return "unsupported_type";
  if (file.size > MEDIA_MAX_UPLOAD_BYTES) return "too_large";
  return null;
}

export interface UploadHooks {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export function createUploader(options: { concurrency?: number; createXhr?: () => XMLHttpRequest } = {}) {
  const concurrency = options.concurrency ?? 3;
  const createXhr = options.createXhr ?? (() => new XMLHttpRequest());
  let running = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    running -= 1;
    waiting.shift()?.();
  };

  function send(file: File | Blob, purpose: MediaPurpose, hooks: UploadHooks): Promise<UploadedMedia> {
    return new Promise((resolve, reject) => {
      const xhr = createXhr();
      xhr.open("POST", `/api/v1/admin/media?purpose=${purpose}`);
      // Informational only: the server sniffs the real type from the bytes.
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) hooks.onProgress?.(event.loaded / event.total);
      };
      xhr.onload = () => {
        let body: { data?: { code?: unknown } } & Partial<UploadedMedia> = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          // A non-JSON answer is treated as an unknown failure below.
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as UploadedMedia);
        else reject(new UploadError(typeof body.data?.code === "string" ? body.data.code : null, xhr.status));
      };
      xhr.onerror = () => reject(new UploadError(null, null, true));
      xhr.onabort = () => reject(new UploadError(null, null, false, true));
      hooks.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(file);
    });
  }

  async function upload(file: File | Blob, purpose: MediaPurpose, hooks: UploadHooks = {}): Promise<UploadedMedia> {
    const aborted = () => new UploadError(null, null, false, true);
    if (hooks.signal?.aborted) throw aborted();
    if (running >= concurrency) {
      // Wait for a slot; a cancel while queued leaves the queue without ever starting.
      await new Promise<void>((resolve, reject) => {
        const start = () => {
          hooks.signal?.removeEventListener("abort", cancel);
          resolve();
        };
        const cancel = () => {
          const index = waiting.indexOf(start);
          if (index >= 0) waiting.splice(index, 1);
          reject(aborted());
        };
        waiting.push(start);
        hooks.signal?.addEventListener("abort", cancel, { once: true });
      });
    }
    running += 1;
    try {
      return await send(file, purpose, hooks);
    } finally {
      release();
    }
  }

  return { upload };
}

/** The one uploader of the admin app: at most three uploads at once across every image field. */
export const adminUploader = createUploader({ concurrency: 3 });
