// demo-ticket:start (whole file) -- the Reference module's constants; `just demo-remove` deletes this file.
// The demo ticket's closed value sets (.specs/demo-tickets/spec.md). The database enums are built from these tuples.
export const DEMO_TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type DemoTicketStatus = (typeof DEMO_TICKET_STATUSES)[number];

export const DEMO_TICKET_PRIORITIES = ["low", "normal", "high"] as const;
export type DemoTicketPriority = (typeof DEMO_TICKET_PRIORITIES)[number];

/** The six status tones (neutral, info, progress, warning, success, danger); a Project maps its own statuses to them. */
export type StatusTone = "neutral" | "info" | "progress" | "warning" | "success" | "danger";
export const DEMO_TICKET_STATUS_TONES: Readonly<Record<DemoTicketStatus, StatusTone>> = {
  open: "info",
  in_progress: "progress",
  resolved: "success",
  closed: "neutral",
};

/** The lowerCamel segment of a status in message keys (`admin.demoTickets.statuses.<segment>`). */
export const DEMO_TICKET_STATUS_MESSAGE_KEYS: Readonly<Record<DemoTicketStatus, string>> = { open: "open", in_progress: "inProgress", resolved: "resolved", closed: "closed" };

export const DEMO_TICKET_TITLE_MAX = 200;
export const DEMO_TICKET_DESCRIPTION_MAX = 5000;
// demo-ticket:end
