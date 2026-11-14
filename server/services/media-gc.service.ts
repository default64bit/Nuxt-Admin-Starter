import type { Db } from "../database/types";
import * as repository from "../repositories/media.repository";
import type { MediaRecord } from "../repositories/media.repository";
import type { ObjectStorage } from "../utils/object-storage";

const DRY_RUN_LIMIT = 10_000;

export interface MediaGcOptions {
  /** Only objects registered more than this long ago are touched (default 24 h: an admin may still be filling in a form). */
  olderThanHours?: number;
  batchSize?: number;
  /** Report what would be deleted without deleting anything. */
  dryRun?: boolean;
  now?: () => Date;
  log?: (event: Record<string, unknown>) => void;
}

export interface MediaGcSummary {
  dryRun: boolean;
  /** Objects found unreferenced and old enough. */
  candidates: number;
  /** Registry rows deleted (and their stored objects removed, except `storageFailures`). */
  deleted: number;
  /** Selected, but referenced again before the delete, so kept. */
  kept: number;
  storageFailures: number;
  /** Keys whose registry row is gone but whose stored object could not be removed: delete them by hand. */
  failedKeys: string[];
}

/**
 * Removes media nothing needs any more (.specs/media/spec.md): uploads that were never attached and
 * images that were replaced or removed, once they are older than the grace period. An object that a
 * record references is never touched. For each object the
 * registry row is deleted first and the stored object second, so an interrupted run can leave an
 * orphan file but never a row that points at nothing; a stored object that cannot be removed is
 * reported. The job is idempotent and runs only when an operator starts it (no polling in the app).
 */
export async function collectGarbage({ db, storage }: { db: Db; storage: ObjectStorage }, options: MediaGcOptions = {}): Promise<MediaGcSummary> {
  const { olderThanHours = 24, batchSize = 100, dryRun = false, now = () => new Date(), log = () => undefined } = options;
  const olderThan = new Date(now().getTime() - olderThanHours * 3_600_000);
  const summary: MediaGcSummary = { dryRun, candidates: 0, deleted: 0, kept: 0, storageFailures: 0, failedKeys: [] };

  if (dryRun) {
    // Nothing is deleted, so one capped look is the whole report.
    for (const media of await repository.findUnreferencedMedia(db, { olderThan, limit: DRY_RUN_LIMIT })) {
      summary.candidates += 1;
      log({ event: "would_delete", bucket: media.bucket, objectKey: media.objectKey });
    }
    return summary;
  }

  // Each pass deletes what it selected, so the next pass sees the following batch; `seen` stops a loop
  // on an object that cannot be deleted for some other reason.
  const seen = new Set<string>();
  for (;;) {
    const batch: MediaRecord[] = (await repository.findUnreferencedMedia(db, { olderThan, limit: batchSize })).filter((media) => !seen.has(media.id));
    if (batch.length === 0) break;
    for (const media of batch) {
      seen.add(media.id);
      summary.candidates += 1;
      const removed = await repository.deleteMediaIfUnreferenced(db, media.id);
      if (!removed) {
        summary.kept += 1;
        continue;
      }
      summary.deleted += 1;
      try {
        await storage.remove(removed.bucket, removed.objectKey);
        log({ event: "deleted", bucket: removed.bucket, objectKey: removed.objectKey });
      } catch (error) {
        summary.storageFailures += 1;
        summary.failedKeys.push(`${removed.bucket}/${removed.objectKey}`);
        log({ event: "storage_delete_failed", bucket: removed.bucket, objectKey: removed.objectKey, message: error instanceof Error ? error.message : "unknown error" });
      }
    }
  }
  return summary;
}
