import { z } from "zod";
import { ATTENTION_TYPES, type AttentionType } from "../constants/notification-catalog";
import { parseInboxCursor } from "../utils/inbox-cursor";
import { adminListQuerySchema } from "./admin-list";

// The Inbox API contract. `open` is the Popover's set: every unresolved item, read or not; `unread` is the bell's count
// set; `read` is every visible item the User has marked read (done or not); `all` is everything the User may see.
export const INBOX_TABS = ["unread", "all", "open", "read"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];
export const INBOX_POPOVER_LIMIT = 10;

const attentionTypeSchema = z.string().refine((value): value is AttentionType => value in ATTENTION_TYPES, "invalid");

export const inboxListQuerySchema = z.object({
  tab: z.enum(INBOX_TABS).default("unread"),
  type: attentionTypeSchema.optional(),
  page: adminListQuerySchema.shape.page,
  /** The Popover asks for its 10 items; the page uses the admin page size. */
  limit: z.coerce.number().int().min(1).max(20).optional(),
  /** The live Inbox's cursor (`<createdAt>_<id>`): only items strictly after it in `(createdAt, id)` order. */
  after: z
    .string()
    .transform((value, ctx) => {
      const cursor = parseInboxCursor(value);
      if (!cursor) ctx.addIssue({ code: "custom", message: "invalid" });
      return cursor ?? z.NEVER;
    })
    .optional(),
});
export type InboxListQuery = z.output<typeof inboxListQuerySchema>;

export const inboxItemSchema = z.object({
  id: z.string().uuid(),
  type: attentionTypeSchema,
  tokens: z.array(z.string()).max(3),
  link: z.string(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  read: z.boolean(),
});
export type InboxItem = z.output<typeof inboxItemSchema>;

export const inboxListSchema = z.object({ items: z.array(inboxItemSchema).max(100), total: z.number().int().min(0), page: z.number().int().min(1) });
export type InboxList = z.output<typeof inboxListSchema>;

export const inboxReadAllBodySchema = z.object({ before: z.string().datetime({ offset: true }) });
export type InboxReadAllBody = z.output<typeof inboxReadAllBodySchema>;
