// The media pipeline's closed values (.specs/media/spec.md). Core code never names a Project's purposes: a purpose is
// registered here with the Permission that gates its uploads, and `MediaPurpose` is a plain string so that an empty
// registry (the demo removed) still compiles.
import type { PermissionKey } from "./permissions";

export const MEDIA_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MEDIA_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Uploads per User per minute. */
export const MEDIA_UPLOADS_PER_MINUTE = 30;

export type MediaPurpose = string;

/** Each purpose is gated by the Permission of the record the image is for. */
export const MEDIA_PURPOSE_PERMISSIONS: Readonly<Record<string, PermissionKey>> = {
  // demo-ticket:start
  "demo-ticket-image": "manage-demo-tickets",
  // demo-ticket:end
};

export const isMediaPurpose = (value: string): boolean => Object.hasOwn(MEDIA_PURPOSE_PERMISSIONS, value);

// demo-ticket:start
export const DEMO_TICKET_IMAGE_PURPOSE = "demo-ticket-image";
// demo-ticket:end
