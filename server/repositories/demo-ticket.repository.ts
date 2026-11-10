// demo-ticket:start (whole file) -- all database access of the demo ticket domain.
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Executor } from "../database/types";
import { demoTickets, users } from "../database/schema";
import type { DemoTicketPriority, DemoTicketStatus } from "../../shared/constants/demo-ticket";
import { normalizedName, normalizedText } from "./name-search";

export interface TicketFilters {
  /** `%text%` with LIKE metacharacters escaped, matched against the normalized title. */
  titlePattern?: string;
  status?: DemoTicketStatus;
  priority?: DemoTicketPriority;
  /** A User id, or `null` for the tickets nobody holds. */
  assigneeId?: string | null;
}

export interface PersonRecord {
  id: string;
  givenName: string | null;
  familyName: string | null;
}

export interface TicketRecord {
  id: string;
  title: string;
  description: string | null;
  status: DemoTicketStatus;
  priority: DemoTicketPriority;
  assigneeId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  statusSince: Date;
}

const columns = {
  id: demoTickets.id,
  title: demoTickets.title,
  description: demoTickets.description,
  status: demoTickets.status,
  priority: demoTickets.priority,
  assigneeId: demoTickets.assigneeId,
  createdBy: demoTickets.createdBy,
  createdAt: demoTickets.createdAt,
  updatedAt: demoTickets.updatedAt,
  statusSince: demoTickets.statusSince,
};

function where(filters: TicketFilters): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    filters.titlePattern ? sql`${normalizedText(sql`${demoTickets.title}`)} LIKE ${filters.titlePattern}` : undefined,
    filters.status ? eq(demoTickets.status, filters.status) : undefined,
    filters.priority ? eq(demoTickets.priority, filters.priority) : undefined,
    filters.assigneeId === null ? isNull(demoTickets.assigneeId) : filters.assigneeId ? eq(demoTickets.assigneeId, filters.assigneeId) : undefined,
  ];
  const present = conditions.filter((condition): condition is SQL => condition !== undefined);
  return present.length ? and(...present) : undefined;
}

/** Newest tickets first, then id. */
export async function listTickets(db: Executor, filters: TicketFilters, page: { offset: number; limit: number }) {
  const condition = where(filters);
  const [rows, [counted]] = await Promise.all([
    db.select(columns).from(demoTickets).where(condition).orderBy(desc(demoTickets.createdAt), desc(demoTickets.id)).limit(page.limit).offset(page.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(demoTickets).where(condition),
  ]);
  return { rows: rows as TicketRecord[], total: counted?.total ?? 0 };
}

export async function findTicket(db: Executor, id: string): Promise<TicketRecord | undefined> {
  const [row] = await db.select(columns).from(demoTickets).where(eq(demoTickets.id, id)).limit(1);
  return row as TicketRecord | undefined;
}

/** Locks the ticket row until the transaction ends, so two saves, or a save and a delete, cannot interleave. */
export async function lockTicket(tx: Executor, id: string): Promise<TicketRecord | undefined> {
  const [row] = await tx.select(columns).from(demoTickets).where(eq(demoTickets.id, id)).for("update").limit(1);
  return row as TicketRecord | undefined;
}

/** The names of some Users at once (assignees and creators of a page of tickets). */
export async function peopleByIds(db: Executor, ids: string[]): Promise<PersonRecord[]> {
  if (ids.length === 0) return [];
  return db.select({ id: users.id, givenName: users.givenName, familyName: users.familyName }).from(users).where(inArray(users.id, ids));
}

/** Every active User, by name, for the assignee pickers. */
export async function listActiveAssignees(db: Executor, limit: number): Promise<PersonRecord[]> {
  return db
    .select({ id: users.id, givenName: users.givenName, familyName: users.familyName })
    .from(users)
    .where(eq(users.status, "active"))
    .orderBy(asc(normalizedName), asc(users.id))
    .limit(limit);
}

/** The account when it exists and is active; assigning to anyone else is refused. */
export async function findActiveUserId(db: Executor, id: string): Promise<string | undefined> {
  const [row] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, id), eq(users.status, "active"))).limit(1);
  return row?.id;
}

export async function insertTicket(
  tx: Executor,
  values: { title: string; description: string | null; priority: DemoTicketPriority; assigneeId: string | null; createdBy: string },
): Promise<string> {
  const [row] = await tx.insert(demoTickets).values(values).returning({ id: demoTickets.id });
  return row!.id;
}

/** Tickets still waiting for work (open or in progress): the Demo tickets menu badge. */
export async function countOpenTickets(db: Executor): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(demoTickets).where(inArray(demoTickets.status, ["open", "in_progress"]));
  return row?.n ?? 0;
}

/** Writes the changed columns and moves the version (returned); a status change also moves `statusSince`. */
export async function updateTicket(
  tx: Executor,
  id: string,
  values: Partial<{ title: string; description: string | null; priority: DemoTicketPriority; assigneeId: string | null; status: DemoTicketStatus }>,
): Promise<Date> {
  const now = new Date();
  await tx
    .update(demoTickets)
    .set({ ...values, updatedAt: now, ...(values.status ? { statusSince: now } : {}) })
    .where(eq(demoTickets.id, id));
  return now;
}

export async function deleteTicketRow(tx: Executor, id: string) {
  await tx.delete(demoTickets).where(eq(demoTickets.id, id));
}
// demo-ticket:end
