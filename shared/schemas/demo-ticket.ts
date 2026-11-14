// demo-ticket:start (whole file) -- Zod contracts of the demo ticket API (.specs/demo-tickets/spec.md).
import { z } from "zod";
import { DEMO_TICKET_DESCRIPTION_MAX, DEMO_TICKET_PRIORITIES, DEMO_TICKET_STATUSES, DEMO_TICKET_TITLE_MAX, type DemoTicketPriority, type DemoTicketStatus } from "../constants/demo-ticket";
import { adminListQuerySchema } from "./admin-list";
import { requiredOrInvalid } from "./issue-messages";
import { ownerImageShape, withOwnerImageRule, type OwnerImage } from "./owner-image";

/** The assignee filter value for tickets nobody holds. */
export const DEMO_TICKET_UNASSIGNED = "none";

/** `GET` list: the shared `q` and `page`, plus the status, priority and assignee filters. */
export const demoTicketListQuerySchema = adminListQuerySchema.extend({
  status: z.enum(DEMO_TICKET_STATUSES).optional(),
  priority: z.enum(DEMO_TICKET_PRIORITIES).optional(),
  assignee: z.union([z.uuid("invalid"), z.literal(DEMO_TICKET_UNASSIGNED)]).optional(),
});
export type DemoTicketListQuery = z.output<typeof demoTicketListQuerySchema>;

export interface DemoTicketPerson {
  id: string;
  givenName: string | null;
  familyName: string | null;
}

export interface DemoTicketRow {
  id: string;
  title: string;
  description: string | null;
  status: DemoTicketStatus;
  priority: DemoTicketPriority;
  assignee: DemoTicketPerson | null;
  createdBy: DemoTicketPerson | null;
  createdAt: string;
  /** The ticket's version: every change moves it, and every write names the one it was loaded at. */
  updatedAt: string;
  /** When the ticket entered its current status; the waiting-long chip counts from here. */
  statusSince: string;
  /** The optional image; null for a ticket without one. */
  image: OwnerImage | null;
}

export interface DemoTicketList {
  items: DemoTicketRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** The Users a ticket can be assigned to (active accounts), for the filter and the dialog. */
export interface DemoTicketAssigneeList {
  items: DemoTicketPerson[];
}

const title = z
  .string(requiredOrInvalid)
  .trim()
  .min(1, "required")
  .max(DEMO_TICKET_TITLE_MAX, "too_long")
  // eslint-disable-next-line no-control-regex
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "control_characters");

/** Plain text; blank or `null` clears it. */
const description = z
  .string(requiredOrInvalid)
  .trim()
  .max(DEMO_TICKET_DESCRIPTION_MAX, "too_long")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const assigneeId = z.uuid("invalid").nullable().optional();
const version = z.string(requiredOrInvalid).datetime({ offset: true, message: "invalid" });

/** `POST`: a new ticket starts `open` and unassigned unless an assignee is given. */
export const demoTicketCreateSchema = withOwnerImageRule(
  z
    .object({
      title,
      description,
      priority: z.enum(DEMO_TICKET_PRIORITIES, requiredOrInvalid).default("normal"),
      assigneeId,
      ...ownerImageShape,
    })
    .strict(),
);
export type DemoTicketCreateBody = z.output<typeof demoTicketCreateSchema>;

/**
 * `PATCH .../{id}`: any of the editable fields and the version the ticket was loaded at (`409 stale_version`
 * otherwise). `status`, when it differs from the current one, must be exactly the next one (`409
 * invalid_transition` otherwise). A save that changes nothing writes nothing.
 */
export const demoTicketUpdateSchema = withOwnerImageRule(
  z
    .object({
      title: title.optional(),
      description,
      priority: z.enum(DEMO_TICKET_PRIORITIES, requiredOrInvalid).optional(),
      assigneeId,
      status: z.enum(DEMO_TICKET_STATUSES, requiredOrInvalid).optional(),
      expectedUpdatedAt: version,
      ...ownerImageShape,
    })
    .strict(),
);
export type DemoTicketUpdateBody = z.output<typeof demoTicketUpdateSchema>;
// demo-ticket:end
