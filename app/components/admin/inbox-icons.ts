// demo-ticket:start
import { IconTicket } from "@tabler/icons-vue";
// demo-ticket:end
import type { Component } from "vue";
import type { AttentionType } from "~~/shared/constants/notification-catalog";

/** One icon per Notification event, shown at the start of an Inbox item. A Project adds one row per catalogue entry. */
export const INBOX_TYPE_ICONS: Record<AttentionType, Component> = {
  // demo-ticket:start
  "demo_ticket.assigned": IconTicket,
  // demo-ticket:end
};

/** One tint per event: a soft background with a readable icon colour in light and dark. */
export const INBOX_TYPE_COLORS: Record<AttentionType, string> = {
  // demo-ticket:start
  "demo_ticket.assigned": "bg-sky-500/15 text-sky-600 dark:bg-sky-400/20 dark:text-sky-400",
  // demo-ticket:end
};
