import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Executor } from "../database/types";
import { mediaObjects } from "../database/schema";
import type { MediaBucket } from "../../shared/constants/database-enums";
import type { MediaPurpose } from "../../shared/constants/media";
import { unreferenced } from "./media-owners";

export interface MediaRecord {
  id: string;
  bucket: MediaBucket;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  purpose: MediaPurpose | null;
  uploadedByUserId: string | null;
}

const columns = {
  id: mediaObjects.id,
  bucket: mediaObjects.bucket,
  objectKey: mediaObjects.objectKey,
  mimeType: mediaObjects.mimeType,
  byteSize: mediaObjects.byteSize,
  width: mediaObjects.width,
  height: mediaObjects.height,
  purpose: mediaObjects.purpose,
  uploadedByUserId: mediaObjects.uploadedByUserId,
};

export async function findMedia(db: Executor, id: string): Promise<MediaRecord | undefined> {
  const [row] = await db.select(columns).from(mediaObjects).where(eq(mediaObjects.id, id));
  return row as MediaRecord | undefined;
}

/** Several registered objects at once (the images of a page of records). */
export async function findMediaMany(db: Executor, ids: string[]): Promise<MediaRecord[]> {
  if (ids.length === 0) return [];
  return (await db.select(columns).from(mediaObjects).where(inArray(mediaObjects.id, ids))) as MediaRecord[];
}

export async function insertMedia(db: Executor, values: Omit<MediaRecord, "id">): Promise<MediaRecord> {
  const [row] = await db.insert(mediaObjects).values(values).returning(columns);
  return row as MediaRecord;
}

/** How many uploads the User registered in the last minute (the rate-limit input). */
export async function countRecentUploads(db: Executor, userId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 60_000);
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mediaObjects)
    .where(and(eq(mediaObjects.uploadedByUserId, userId), gt(mediaObjects.createdAt, since)));
  return row?.total ?? 0;
}

export async function setMediaPublic(db: Executor, id: string, objectKey: string): Promise<void> {
  await db.update(mediaObjects).set({ bucket: "public", objectKey }).where(eq(mediaObjects.id, id));
}

/** Objects nothing references that were registered before `olderThan` (oldest first): abandoned uploads and detached images. */
export async function findUnreferencedMedia(db: Executor, query: { olderThan: Date; limit: number }): Promise<MediaRecord[]> {
  const rows = await db
    .select(columns)
    .from(mediaObjects)
    .where(and(lt(mediaObjects.createdAt, query.olderThan), unreferenced()))
    .orderBy(asc(mediaObjects.createdAt), asc(mediaObjects.id))
    .limit(query.limit);
  return rows as MediaRecord[];
}

/**
 * Deletes a registry row only if nothing references it at this moment (the check and the delete are
 * one statement, and the foreign keys still stand behind it). Returns where the object lives so the
 * caller can delete it from storage afterwards, or null when it was kept.
 */
export async function deleteMediaIfUnreferenced(db: Executor, id: string): Promise<{ bucket: MediaBucket; objectKey: string } | null> {
  try {
    const rows = await db
      .delete(mediaObjects)
      .where(and(eq(mediaObjects.id, id), unreferenced()))
      .returning({ bucket: mediaObjects.bucket, objectKey: mediaObjects.objectKey });
    return rows[0] ?? null;
  } catch (error) {
    // A reference appeared between the check and the delete: the foreign key refused it, so it stays.
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23503" || code === "23001") return null;
    throw error;
  }
}
