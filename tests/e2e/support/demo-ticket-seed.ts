// demo-ticket:start (whole file) -- the demo ticket e2e seed; `just demo-remove` deletes this file.
import type pg from "pg";

export interface SeededTicket {
  id: string;
  title: string;
}

interface SeedOptions {
  /** A unique tag put in every title, so a spec finds and removes exactly its own tickets. */
  tag: string;
  /** The User recorded as the creator (and the assignee of the assigned ones). */
  userId: string;
  /** How many filler tickets, newest first; with more than 20 the list has a second page. */
  filler?: number;
}

const HOUR = 60 * 60 * 1000;

/**
 * Inserts a known set of demo tickets straight into the database: `filler` plain open tickets, then three named ones
 * (an old open ticket that shows the waiting-long chip, a high-priority ticket in progress assigned to `userId`, and
 * a closed one). Returns the named ones by key.
 */
export async function seedDemoTickets(pool: pg.Pool, { tag, userId, filler = 22 }: SeedOptions): Promise<Record<"waiting" | "progress" | "closed", SeededTicket>> {
  const now = Date.now();
  const insert = async (title: string, status: string, priority: string, assigneeId: string | null, ageHours: number, sinceHours: number): Promise<SeededTicket> => {
    const { rows } = await pool.query(
      "INSERT INTO demo_tickets (title, status, priority, assignee_id, created_by, created_at, updated_at, status_since) VALUES ($1, $2, $3, $4, $5, $6, $6, $7) RETURNING id",
      [title, status, priority, assigneeId, userId, new Date(now - ageHours * HOUR), new Date(now - sinceHours * HOUR)],
    );
    return { id: rows[0].id as string, title };
  };
  // Oldest first, so the named tickets (the newest) lead the list.
  for (let index = filler; index >= 1; index--) await insert(`${tag} filler ${String(index).padStart(2, "0")}`, "open", "normal", null, 100 + index, 1);
  return {
    closed: await insert(`${tag} closed job`, "closed", "low", null, 30, 1),
    progress: await insert(`${tag} progress job`, "in_progress", "high", userId, 40, 1),
    waiting: await insert(`${tag} waiting job`, "open", "normal", null, 50, 30),
  };
}

/** Removes the tickets of a tag, including the ones a spec created through the UI. */
export async function removeDemoTickets(pool: pg.Pool, tag: string): Promise<void> {
  await pool.query("DELETE FROM demo_tickets WHERE title LIKE $1", [`%${tag}%`]);
}
// demo-ticket:end
