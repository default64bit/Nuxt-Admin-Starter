import { and, eq, isNull, sql } from "drizzle-orm";
import type { Executor } from "../database/types";
import { notifications } from "../database/schema";

export interface NewAttention {
  type: string;
  requiredPermission: string;
  recipientUserId: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  tokens: string[];
  dedupeKey: string;
}

/** Inserts the item unless one with the same dedupe key exists; returns its id only when it was inserted. */
export async function insertAttention(tx: Executor, row: NewAttention): Promise<string | undefined> {
  const [inserted] = await tx.insert(notifications).values(row).onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id: notifications.id });
  return inserted?.id;
}

/** Sets `resolved_at` on an unresolved item; true only for the call that resolved it. */
export async function markResolved(tx: Executor, dedupeKey: string): Promise<boolean> {
  const resolved = await tx
    .update(notifications)
    .set({ resolvedAt: sql`now()` })
    .where(and(eq(notifications.dedupeKey, dedupeKey), isNull(notifications.resolvedAt)))
    .returning({ id: notifications.id });
  return resolved.length > 0;
}

/** Resolves every open item of one type about one source entity; returns how many it closed. */
export async function markResolvedForSource(tx: Executor, type: string, sourceEntityType: string, sourceEntityId: string): Promise<number> {
  const resolved = await tx
    .update(notifications)
    .set({ resolvedAt: sql`now()` })
    .where(and(eq(notifications.type, type), eq(notifications.sourceEntityType, sourceEntityType), eq(notifications.sourceEntityId, sourceEntityId), isNull(notifications.resolvedAt)))
    .returning({ id: notifications.id });
  return resolved.length;
}
