import { randomUUID } from "node:crypto";
import type { Db, Executor } from "../database/types";
import { MEDIA_UPLOADS_PER_MINUTE, type MediaPurpose } from "../../shared/constants/media";
import type { UploadedMedia } from "../../shared/schemas/media";
import { findMediaOwners, type MediaOwner } from "../repositories/media-owners";
import * as repository from "../repositories/media.repository";
import type { MediaRecord } from "../repositories/media.repository";
import { DomainError, mediaInvalid, tooManyRequests } from "../utils/domain-errors";
import { processImage } from "../utils/image-processing";
import type { ObjectStorage } from "../utils/object-storage";

export const UPLOADS_PER_MINUTE = MEDIA_UPLOADS_PER_MINUTE;

export interface MediaDeps {
  db: Db;
  storage: ObjectStorage;
  now?: () => Date;
}

export const previewUrlOf = (id: string) => `/api/v1/admin/media/${id}/file`;

/**
 * Validates, processes and stages an upload (.specs/media/spec.md): the object lands in the private bucket under a
 * random `staging/` key and is registered with its purpose and uploader. It stays private until the owning record is
 * saved (see `promoteStagedMedia`).
 */
export async function uploadStagedImage(
  { db, storage, now = () => new Date() }: MediaDeps,
  actor: { userId: string },
  input: { purpose: MediaPurpose; body: Buffer },
): Promise<UploadedMedia> {
  if ((await repository.countRecentUploads(db, actor.userId, now())) >= UPLOADS_PER_MINUTE) throw tooManyRequests("rate_limited", 60);
  const image = await processImage(input.body);
  const objectKey = `staging/${randomUUID()}.${image.ext}`;
  await storage.put("private", objectKey, image.buffer, image.mimeType);
  try {
    const row = await repository.insertMedia(db, {
      bucket: "private",
      objectKey,
      mimeType: image.mimeType,
      byteSize: image.buffer.byteLength,
      width: image.width,
      height: image.height,
      purpose: input.purpose,
      uploadedByUserId: actor.userId,
    });
    return { id: row.id, mimeType: row.mimeType, byteSize: row.byteSize, width: row.width, height: row.height, previewUrl: previewUrlOf(row.id) };
  } catch (error) {
    await storage.remove("private", objectKey).catch(() => undefined);
    throw error;
  }
}

/** The stored bytes of a registered object (admin preview of a private image, or a public one). */
export async function readMediaFile({ db, storage }: Pick<MediaDeps, "db" | "storage">, id: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const row = await repository.findMedia(db, id);
  if (!row) throw new DomainError(404, "Not Found", "not_found");
  try {
    return { buffer: await storage.get(row.bucket, row.objectKey), mimeType: row.mimeType };
  } catch {
    throw new DomainError(404, "Not Found", "not_found");
  }
}

export interface ResolvedMedia extends MediaRecord {
  /** Already attached to the very owner being saved (a re-save), so it needs no promotion. */
  attached: boolean;
}

/**
 * The attach check every owner save runs: the object exists, was uploaded by this User for this purpose, and is either
 * still staged (private and unattached) or already attached to this same owner. Anything else is `422 media_invalid`
 * and nothing is attached.
 */
export async function resolveStagedMedia(
  db: Executor,
  input: { mediaObjectId: string; purpose: MediaPurpose; actorUserId: string; owner?: MediaOwner },
): Promise<ResolvedMedia> {
  const media = await repository.findMedia(db, input.mediaObjectId);
  if (!media) throw mediaInvalid();
  const owners = await findMediaOwners(db, media.id);
  if (owners.length > 0) {
    // Already attached: fine only for the owner itself (a re-save), whoever uploaded it originally.
    const target = input.owner;
    if (!target || !owners.every((owner) => owner.kind === target.kind && owner.id === target.id)) throw mediaInvalid();
    return { ...media, attached: true };
  }
  // Still staged: it must be this User's upload for this kind of record, and still private.
  if (media.purpose !== input.purpose || media.uploadedByUserId !== input.actorUserId || media.bucket !== "private") throw mediaInvalid();
  return { ...media, attached: false };
}

export interface Promotion {
  /** The staging key to delete once the owner save has committed. */
  stagingKey: string;
}

/**
 * Copies a staged object to the public bucket under a fresh random `images/` key and points its registry row at it (call
 * inside the owner's transaction). Deleting the private copy is a separate step after commit; a failure anywhere leaves
 * only an unreferenced object for media GC.
 */
export async function promoteStagedMedia(db: Executor, storage: ObjectStorage, media: ResolvedMedia): Promise<Promotion> {
  const ext = media.objectKey.slice(media.objectKey.lastIndexOf(".") + 1);
  const publicKey = `images/${randomUUID()}.${ext}`;
  await storage.copy({ bucket: "private", key: media.objectKey }, { bucket: "public", key: publicKey });
  await repository.setMediaPublic(db, media.id, publicKey);
  return { stagingKey: media.objectKey };
}

export async function discardStagingCopy(storage: ObjectStorage, promotion: Promotion): Promise<void> {
  await storage.remove("private", promotion.stagingKey).catch(() => undefined);
}
