// demo-ticket:start (whole file) -- business rules of the demo ticket domain (.specs/demo-tickets/spec.md).
import type { Db, Tx } from "../database/types";
import { ADMIN_PAGE_SIZE, pageOffset } from "../../shared/schemas/admin-list";
import { DEMO_TICKET_UNASSIGNED, type DemoTicketAssigneeList, type DemoTicketCreateBody, type DemoTicketList, type DemoTicketListQuery, type DemoTicketPerson, type DemoTicketRow, type DemoTicketUpdateBody } from "../../shared/schemas/demo-ticket";
import { isForwardStep } from "../../shared/utils/demo-ticket-rules";
import { normalizeSearchText } from "../../shared/utils/search-normalize";
import * as repository from "../repositories/demo-ticket.repository";
import { containsPattern } from "../repositories/name-search";
import { DomainError, invalidTransition, staleVersion, validationFailed } from "../utils/domain-errors";
import { recordAudit, type AuditContext } from "./admin-audit.service";
import type { AdminActor } from "./authorization";

export interface DemoTicketDeps {
  db: Db;
}

export type DemoTicketActor = Pick<AdminActor, "userId" | "requestId">;

/** The assignee picker lists at most this many active Users. */
const ASSIGNEE_OPTIONS_LIMIT = 200;

/** The audit context of a write: who acted, and the request it came in on. */
const auditOf = (actor: DemoTicketActor): AuditContext => ({ actorUserId: actor.userId, correlationId: actor.requestId });

const notFound = () => new DomainError(404, "Not Found", "not_found");

async function rowsOf(db: Db | Tx, records: repository.TicketRecord[]): Promise<DemoTicketRow[]> {
  const ids = [...new Set(records.flatMap((record) => [record.assigneeId, record.createdBy]).filter((id): id is string => id !== null))];
  const people = new Map<string, DemoTicketPerson>((await repository.peopleByIds(db, ids)).map((person) => [person.id, person]));
  return records.map((record) => ({
    id: record.id,
    title: record.title,
    description: record.description,
    status: record.status,
    priority: record.priority,
    assignee: record.assigneeId ? (people.get(record.assigneeId) ?? null) : null,
    createdBy: people.get(record.createdBy) ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    statusSince: record.statusSince.toISOString(),
  }));
}

async function detailOf(db: Db | Tx, id: string): Promise<DemoTicketRow> {
  const record = await repository.findTicket(db, id);
  if (!record) throw notFound();
  return (await rowsOf(db, [record]))[0]!;
}

/** The demo ticket list: newest first, 20 per page, searched by the normalized title. A read: nothing is written. */
export async function listDemoTickets({ db }: DemoTicketDeps, query: DemoTicketListQuery): Promise<DemoTicketList> {
  const normalized = query.q ? normalizeSearchText(query.q) : "";
  const { rows, total } = await repository.listTickets(
    db,
    {
      titlePattern: normalized ? containsPattern(normalized) : undefined,
      status: query.status,
      priority: query.priority,
      assigneeId: query.assignee === DEMO_TICKET_UNASSIGNED ? null : query.assignee,
    },
    { offset: pageOffset(query.page), limit: ADMIN_PAGE_SIZE },
  );
  return { items: await rowsOf(db, rows), total, page: query.page, pageSize: ADMIN_PAGE_SIZE };
}

/** One ticket, for the `?ticket=<id>` link: it may be on any page of the list. An unknown id is a 404. */
export const getDemoTicket = ({ db }: DemoTicketDeps, id: string): Promise<DemoTicketRow> => detailOf(db, id);

/** The active Users a ticket can be assigned to. */
export async function listDemoTicketAssignees({ db }: DemoTicketDeps): Promise<DemoTicketAssigneeList> {
  return { items: await repository.listActiveAssignees(db, ASSIGNEE_OPTIONS_LIMIT) };
}

/** A ticket can only be assigned to an active User. */
async function assertAssignable(tx: Tx, assigneeId: string) {
  if (!(await repository.findActiveUserId(tx, assigneeId))) throw validationFailed({ assigneeId: ["unknown"] });
}

/** Creates a ticket: it starts `open`, `statusSince` now, created by the actor. */
export async function createDemoTicket(deps: DemoTicketDeps, actor: DemoTicketActor, body: DemoTicketCreateBody): Promise<DemoTicketRow> {
  // One transaction per write: the audit event is recorded inside it.
  const id = await deps.db.transaction(async (tx) => {
    if (body.assigneeId) await assertAssignable(tx, body.assigneeId);
    const created = await repository.insertTicket(tx, { title: body.title, description: body.description ?? null, priority: body.priority, assigneeId: body.assigneeId ?? null, createdBy: actor.userId });
    await recordAudit(tx, auditOf(actor), {
      action: "demo_ticket.created",
      entityType: "demo_ticket",
      entityId: created,
      changeSummary: { title: body.title, priority: body.priority, assignee: body.assigneeId ?? null },
    });
    return created;
  });
  return detailOf(deps.db, id);
}

/**
 * Saves a ticket at the version it was loaded at (`409 stale_version` with the ticket as it is now otherwise). Only
 * the difference is written. A status change must be the next step (`409 invalid_transition`). A save that changes
 * nothing writes nothing and moves no version. Field changes and a status change are audited as two events.
 */
export async function updateDemoTicket(deps: DemoTicketDeps, actor: DemoTicketActor, id: string, body: DemoTicketUpdateBody): Promise<DemoTicketRow> {
  await deps.db.transaction(async (tx) => {
    const current = await repository.lockTicket(tx, id);
    if (!current) throw notFound();
    if (new Date(body.expectedUpdatedAt).getTime() !== current.updatedAt.getTime()) throw staleVersion((await detailOf(tx, id)) as unknown as Record<string, unknown>);

    const fields: Parameters<typeof repository.updateTicket>[2] = {};
    const old: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};
    if (body.title !== undefined && body.title !== current.title) {
      fields.title = body.title;
      old.title = current.title;
      next.title = body.title;
    }
    if (body.priority !== undefined && body.priority !== current.priority) {
      fields.priority = body.priority;
      old.priority = current.priority;
      next.priority = body.priority;
    }
    if (body.assigneeId !== undefined && body.assigneeId !== current.assigneeId) {
      if (body.assigneeId) await assertAssignable(tx, body.assigneeId);
      fields.assigneeId = body.assigneeId;
      old.assignee = current.assigneeId;
      next.assignee = body.assigneeId;
    }
    const descriptionChanged = body.description !== undefined && body.description !== current.description;
    if (descriptionChanged) fields.description = body.description ?? null;

    const statusChanged = body.status !== undefined && body.status !== current.status;
    if (statusChanged && !isForwardStep(current.status, body.status!)) throw invalidTransition({ status: current.status });
    if (statusChanged) fields.status = body.status!;

    if (Object.keys(fields).length === 0) return;
    await repository.updateTicket(tx, id, fields);
    if (Object.keys(old).length > 0 || descriptionChanged) {
      await recordAudit(tx, auditOf(actor), {
        action: "demo_ticket.updated",
        entityType: "demo_ticket",
        entityId: id,
        changeSummary: { old, new: next, ...(descriptionChanged ? { descriptionChanged: true } : {}) },
      });
    }
    if (statusChanged) {
      await recordAudit(tx, auditOf(actor), {
        action: "demo_ticket.status_changed",
        entityType: "demo_ticket",
        entityId: id,
        changeSummary: { old: { status: current.status }, new: { status: body.status } },
      });
    }
  });
  return detailOf(deps.db, id);
}

/** Deletes a ticket for good (a hard delete; the handler's confirmation is the User's decision). An unknown id is a 404. */
export async function deleteDemoTicket(deps: DemoTicketDeps, actor: DemoTicketActor, id: string): Promise<void> {
  await deps.db.transaction(async (tx) => {
    const current = await repository.lockTicket(tx, id);
    if (!current) throw notFound();
    await repository.deleteTicketRow(tx, id);
    await recordAudit(tx, auditOf(actor), {
      action: "demo_ticket.deleted",
      entityType: "demo_ticket",
      entityId: id,
      changeSummary: { title: current.title, status: current.status },
    });
  });
}
// demo-ticket:end
