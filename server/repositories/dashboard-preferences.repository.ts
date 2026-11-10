import { and, eq, isNull, sql } from "drizzle-orm";
import type { Executor } from "../database/types";
import { dashboardPreferences, type DashboardPreferencesRow } from "../database/schema";

/** The User's own preferences row, or undefined when none was ever stored (every default applies). */
export async function findPreferences(db: Executor, userId: string): Promise<DashboardPreferencesRow | undefined> {
  const [row] = await db.select().from(dashboardPreferences).where(eq(dashboardPreferences.userId, userId)).limit(1);
  return row;
}

/**
 * Saves one module's range at once. A missing row is created with every other default. Only `ranges` and
 * `updated_at` change: the arrangement and its Save version are untouched, so a later Save never conflicts.
 */
export async function upsertRange(db: Executor, userId: string, moduleKey: string, range: string): Promise<void> {
  await db
    .insert(dashboardPreferences)
    .values({ userId, ranges: { [moduleKey]: range } })
    .onConflictDoUpdate({
      target: dashboardPreferences.userId,
      set: { ranges: sql`${dashboardPreferences.ranges} || jsonb_build_object(${moduleKey}::text, ${range}::text)`, updatedAt: sql`now()` },
    });
}

/** Saves the Chart style at once. A missing row is created with every other default; the arrangement and its version are untouched. */
export async function upsertChartStyle(db: Executor, userId: string, chartStyle: string): Promise<void> {
  await db
    .insert(dashboardPreferences)
    .values({ userId, chartStyle })
    .onConflictDoUpdate({ target: dashboardPreferences.userId, set: { chartStyle, updatedAt: sql`now()` } });
}

// Milliseconds, because the version travels as an ISO string and a JavaScript Date holds no more.
const VERSION_NOW = sql`date_trunc('milliseconds', now())`;

/**
 * Saves the arrangement (a document, or null for the computed default) only when the stored version is the one the
 * client loaded, in one statement, so two saves from two devices can never both win. Returns false on a mismatch
 * (a stale save). Ranges and the Chart style are untouched.
 */
export async function saveArrangement(db: Executor, userId: string, arrangement: unknown, expected: Date | null): Promise<boolean> {
  if (expected === null) {
    const rows = await db
      .insert(dashboardPreferences)
      .values({ userId, arrangement, arrangementUpdatedAt: VERSION_NOW })
      .onConflictDoUpdate({
        target: dashboardPreferences.userId,
        set: { arrangement, arrangementUpdatedAt: VERSION_NOW, updatedAt: sql`now()` },
        setWhere: isNull(dashboardPreferences.arrangementUpdatedAt),
      })
      .returning({ id: dashboardPreferences.userId });
    return rows.length > 0;
  }
  const rows = await db
    .update(dashboardPreferences)
    .set({ arrangement, arrangementUpdatedAt: VERSION_NOW, updatedAt: sql`now()` })
    .where(and(eq(dashboardPreferences.userId, userId), eq(dashboardPreferences.arrangementUpdatedAt, expected)))
    .returning({ id: dashboardPreferences.userId });
  return rows.length > 0;
}
