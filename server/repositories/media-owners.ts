import { eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import type { Executor } from "../database/types";
import {
  mediaObjects,
  // demo-ticket:start
  demoTickets,
  // demo-ticket:end
} from "../database/schema";

/**
 * The records that can carry an image: one row per owner table. Media GC never deletes an object one of them references,
 * and the attach check lets only the owner itself keep an object that is already attached. A Project that adds an image
 * to a record adds its table here.
 */
export interface MediaOwnerTable {
  kind: string;
  table: AnyPgTable;
  idColumn: AnyPgColumn;
  mediaColumn: AnyPgColumn;
}

export const MEDIA_OWNER_TABLES: readonly MediaOwnerTable[] = [
  // demo-ticket:start
  { kind: "demo-ticket", table: demoTickets, idColumn: demoTickets.id, mediaColumn: demoTickets.imageMediaObjectId },
  // demo-ticket:end
];

export type MediaOwner = { kind: string; id: string };

/** The records that reference the object. */
export async function findMediaOwners(db: Executor, mediaId: string): Promise<MediaOwner[]> {
  const found = await Promise.all(
    MEDIA_OWNER_TABLES.map(async (owner) => {
      const rows = await db.select({ id: owner.idColumn }).from(owner.table).where(eq(owner.mediaColumn, mediaId));
      return rows.map((row) => ({ kind: owner.kind, id: String(row.id) }));
    }),
  );
  return found.flat();
}

/** True when no owner table references the media object (checked in SQL, so a delete can re-check it atomically). */
export const unreferenced = (): SQL => {
  const checks = MEDIA_OWNER_TABLES.map((owner) => sql`NOT EXISTS (SELECT 1 FROM ${owner.table} WHERE ${owner.mediaColumn} = ${mediaObjects.id})`);
  return checks.length ? sql.join(checks, sql` AND `) : sql`true`;
};
