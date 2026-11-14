import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { MEDIA_MAX_UPLOAD_BYTES } from "../../../shared/constants/media";
import { createdAt, uuidPk } from "./_helpers";
import { mediaBucketEnum } from "./enums";
import { users } from "./identity";

// The registry of stored objects (the media pipeline, .specs/media/spec.md). An upload is staged first (private bucket,
// `staging/` key, no owner) and promoted to the public bucket when the record that owns it is saved. A record that
// carries an image references this table with ON DELETE RESTRICT; objects nothing references are removed by media GC.
export const mediaObjects = pgTable(
  "media_objects",
  {
    id: uuidPk(),
    bucket: mediaBucketEnum().notNull(),
    objectKey: text().notNull(),
    mimeType: text().notNull(),
    byteSize: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    // What the upload is for (a key of MEDIA_PURPOSE_PERMISSIONS) and who made it: both set by the upload pipeline, so
    // the owner's save can check a staged object belongs to the same User and the right kind of record. Plain text so
    // that a Project's purposes need no migration.
    purpose: text(),
    uploadedByUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("media_objects_uploader_idx").on(t.uploadedByUserId, t.createdAt),
    uniqueIndex("media_objects_bucket_key_unique").on(t.bucket, t.objectKey),
    check("media_objects_mime_allowed", sql`${t.mimeType} IN ('image/jpeg', 'image/png', 'image/webp')`),
    check("media_objects_size_limit", sql`${t.byteSize} > 0 AND ${t.byteSize} <= ${sql.raw(String(MEDIA_MAX_UPLOAD_BYTES))}`),
    check("media_objects_dimensions_positive", sql`${t.width} > 0 AND ${t.height} > 0`),
  ],
);

export type MediaObject = typeof mediaObjects.$inferSelect;
