import { sql } from "drizzle-orm";
import type { Executor } from "../database/types";

// Account counts for the New accounts module: raw SQL because every figure filters by instant (ADR-0024).

/** Accounts created in `[from, to)`. */
export async function countAccountsCreated(db: Executor, window: { from: Date; to: Date }): Promise<number> {
  const result = await db.execute<{ n: string }>(sql`
    SELECT count(*) AS n FROM users WHERE created_at >= ${window.from.toISOString()}::timestamptz AND created_at < ${window.to.toISOString()}::timestamptz
  `);
  return Number(result.rows[0]!.n);
}

/** Every account now. */
export async function countAccounts(db: Executor): Promise<number> {
  const result = await db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM users`);
  return Number(result.rows[0]!.n);
}

/** Accounts created per Tehran day in `[from, to)`; days with none are absent. */
export async function accountsCreatedByDay(db: Executor, window: { from: Date; to: Date }): Promise<{ day: string; count: number }[]> {
  const result = await db.execute<{ day: string; n: string }>(sql`
    SELECT (created_at AT TIME ZONE 'Asia/Tehran')::date::text AS day, count(*) AS n
    FROM users
    WHERE created_at >= ${window.from.toISOString()}::timestamptz AND created_at < ${window.to.toISOString()}::timestamptz
    GROUP BY 1 ORDER BY 1
  `);
  return result.rows.map((row) => ({ day: row.day, count: Number(row.n) }));
}

/** Accounts whose status is disabled now. */
export async function countDisabledAccounts(db: Executor): Promise<number> {
  const result = await db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM users WHERE status = 'disabled'`);
  return Number(result.rows[0]!.n);
}
