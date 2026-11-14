// demo-ticket:start (whole file) -- the Reference module's tables; they live in their own migration after the baseline.
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { DEMO_TICKET_PRIORITIES, DEMO_TICKET_STATUSES, DEMO_TICKET_TITLE_MAX } from "../../../shared/constants/demo-ticket";
import { createdAt, timestamptz, updatedAt, uuidPk } from "./_helpers";
import { users } from "./identity";
import { mediaObjects } from "./media";

export const demoTicketStatusEnum = pgEnum("demo_ticket_status", DEMO_TICKET_STATUSES);
export const demoTicketPriorityEnum = pgEnum("demo_ticket_priority", DEMO_TICKET_PRIORITIES);

// A demo ticket is deleted for good (hard delete); the Users it names are never deleted, so the references restrict.
export const demoTickets = pgTable(
  "demo_tickets",
  {
    id: uuidPk(),
    title: text().notNull(),
    description: text(),
    status: demoTicketStatusEnum().notNull().default("open"),
    priority: demoTicketPriorityEnum().notNull().default("normal"),
    assigneeId: uuid().references(() => users.id, { onDelete: "restrict" }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    // The ticket's version: every change moves it.
    updatedAt: updatedAt(),
    // When the ticket entered its current status; the waiting-long chip counts from here.
    statusSince: timestamptz().notNull().defaultNow(),
    // The optional image (media purpose `demo-ticket-image`) with Persian and English alt text. Media GC removes an object once no ticket references it.
    imageMediaObjectId: uuid().references(() => mediaObjects.id, { onDelete: "restrict" }),
    imageAltFa: text(),
    imageAltEn: text(),
  },
  (t) => [
    // The list: newest first, then id.
    index("demo_tickets_created_idx").on(t.createdAt.desc(), t.id.desc()),
    index("demo_tickets_status_created_idx").on(t.status, t.createdAt.desc()),
    index("demo_tickets_assignee_idx").on(t.assigneeId),
    index("demo_tickets_image_idx").on(t.imageMediaObjectId),
    check("demo_tickets_title_length", sql`char_length(btrim(${t.title})) BETWEEN 1 AND ${sql.raw(String(DEMO_TICKET_TITLE_MAX))}`),
    check("demo_tickets_image_requires_alt", sql`${t.imageMediaObjectId} IS NULL OR (btrim(coalesce(${t.imageAltFa}, '')) <> '' AND btrim(coalesce(${t.imageAltEn}, '')) <> '')`),
  ],
);

export type DemoTicket = typeof demoTickets.$inferSelect;
// demo-ticket:end
