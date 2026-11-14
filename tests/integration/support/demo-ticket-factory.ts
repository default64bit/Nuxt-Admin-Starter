// demo-ticket:start (whole file) -- the demo ticket factory for integration tests; `just demo-remove` deletes this file.
import { demoTickets } from "../../../server/database/schema";
import type { DemoTicketPriority, DemoTicketStatus } from "../../../shared/constants/demo-ticket";
import type { TestDb } from "./database";

export interface DemoTicketOverrides {
  title?: string;
  description?: string | null;
  status?: DemoTicketStatus;
  priority?: DemoTicketPriority;
  assigneeId?: string | null;
  createdAt?: Date;
  statusSince?: Date;
}

let sequence = 0;

/** Inserts one demo ticket straight into the database (no audit event, no rules) and returns its id. */
export async function createDemoTicketRow(db: TestDb, createdBy: string, overrides: DemoTicketOverrides = {}): Promise<string> {
  sequence += 1;
  const createdAt = overrides.createdAt ?? new Date();
  const [row] = await db
    .insert(demoTickets)
    .values({
      title: overrides.title ?? `Factory ticket ${sequence}`,
      description: overrides.description ?? null,
      status: overrides.status ?? "open",
      priority: overrides.priority ?? "normal",
      assigneeId: overrides.assigneeId ?? null,
      createdBy,
      createdAt,
      updatedAt: createdAt,
      statusSince: overrides.statusSince ?? createdAt,
    })
    .returning({ id: demoTickets.id });
  return row!.id;
}
// demo-ticket:end
