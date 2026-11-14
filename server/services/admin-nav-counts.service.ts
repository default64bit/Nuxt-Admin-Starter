import type { Db } from "../database/types";
import { adminNavCountsSchema, type AdminNavCounts } from "../../shared/schemas/admin-nav-counts";
import { countInboxUnread, newestInboxItem } from "./admin-inbox.service";
import type { AdminActor } from "./authorization";
// demo-ticket:start
import { countOpenTickets } from "../repositories/demo-ticket.repository";
// demo-ticket:end

/**
 * The bell's count (any User) and the queue counts for the menu badges. A queue count is computed, and included, only
 * when the actor holds the Permission of the queue's page; a new queue adds one entry here, its key in the nav-counts
 * schema and its `countKey` on the nav item.
 */
export async function getNavCounts({ db }: { db: Db }, actor: AdminActor): Promise<AdminNavCounts> {
  const counts: AdminNavCounts = { inboxUnread: await countInboxUnread({ db }, actor), newest: await newestInboxItem({ db }, actor), ...(await getQueueCounts({ db }, actor)) };
  return adminNavCountsSchema.parse(counts);
}

/**
 * The queue counts the actor may see (the menu badges). The Dashboard's Needs attention module counts its rows with this
 * same function, so a row and its badge always agree.
 */
export async function getQueueCounts({ db }: { db: Db }, actor: AdminActor): Promise<Partial<AdminNavCounts>> {
  const counts: Partial<AdminNavCounts> = {};
  // demo-ticket:start
  if (actor.has("view-demo-tickets")) counts.openDemoTickets = await countOpenTickets(db);
  // demo-ticket:end
  return counts;
}
