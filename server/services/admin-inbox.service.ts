import type { Db } from "../database/types";
import type { InboxList, InboxListQuery } from "../../shared/schemas/admin-notifications";
import { ADMIN_PAGE_SIZE } from "../../shared/schemas/admin-list";
import { attentionLink } from "../../shared/constants/notification-catalog";
import * as repository from "../repositories/admin-notifications.repository";
import { DomainError } from "../utils/domain-errors";
import type { AdminActor } from "./authorization";

// The Inbox. Every call reads the actor's current Permissions, so visibility is evaluated at read time, and touches only
// the actor's own read rows.

const notFound = () => new DomainError(404, "Not Found", "not_found");
const viewerOf = (actor: AdminActor): repository.Viewer => ({ userId: actor.userId, permissions: actor.permissions });

export function countInboxUnread({ db }: { db: Db }, actor: AdminActor): Promise<number> {
  return repository.countUnread(db, viewerOf(actor));
}

/** The live Inbox's change marker: the newest unresolved item this actor may see, or null. */
export async function newestInboxItem({ db }: { db: Db }, actor: AdminActor): Promise<{ id: string; createdAt: string } | null> {
  const row = await repository.newestUnresolved(db, viewerOf(actor));
  return row ? { id: row.id, createdAt: row.createdAt.toISOString() } : null;
}

export async function listInbox({ db }: { db: Db }, actor: AdminActor, query: InboxListQuery): Promise<InboxList> {
  const limit = query.limit ?? ADMIN_PAGE_SIZE;
  const { rows, total } = await repository.listInbox(db, {
    viewer: viewerOf(actor),
    tab: query.tab,
    ...(query.type ? { type: query.type } : {}),
    limit,
    offset: (query.page - 1) * limit,
    ...(query.after ? { after: query.after } : {}),
  });
  return {
    page: query.page,
    total,
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      tokens: row.tokens,
      link: attentionLink(row.type, row.sourceEntityId),
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      read: row.read,
    })),
  };
}

/** Sets the actor's read state of one item; an item they may not see (or that does not exist) is a 404. */
export async function setInboxRead({ db }: { db: Db }, actor: AdminActor, id: string, read: boolean): Promise<{ id: string; read: boolean }> {
  if (!(await repository.isVisible(db, id, viewerOf(actor)))) throw notFound();
  if (read) await repository.markRead(db, id, actor.userId);
  else await repository.markUnread(db, id, actor.userId);
  return { id, read };
}

/** Marks everything unresolved and visible that was created up to the click; a cutoff in the future counts as now. */
export async function markAllInboxRead({ db }: { db: Db }, actor: AdminActor, before: Date, now = new Date()): Promise<{ marked: number }> {
  const cutoff = before.getTime() > now.getTime() ? now : before;
  return { marked: await repository.markAllRead(db, viewerOf(actor), cutoff) };
}
