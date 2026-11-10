// demo-ticket:start (whole file) -- pure demo ticket rules, shared by the API and the pages.
import { DEMO_TICKET_STATUSES, type DemoTicketStatus } from "../constants/demo-ticket";

/** A demo ticket moves forward only, one step at a time; `closed` is the end. */
export function nextDemoTicketStatus(status: DemoTicketStatus): DemoTicketStatus | null {
  return DEMO_TICKET_STATUSES[DEMO_TICKET_STATUSES.indexOf(status) + 1] ?? null;
}

/** Whether `to` is exactly the step after `from` (no skipping, no staying, no going back, no reopening). */
export const isForwardStep = (from: DemoTicketStatus, to: DemoTicketStatus): boolean => nextDemoTicketStatus(from) === to;

/** How long a ticket may sit in a status before it shows the "waiting long" chip. Only these two statuses wait. */
export const DEMO_TICKET_WAITING_HOURS: Readonly<Partial<Record<DemoTicketStatus, number>>> = { open: 24, in_progress: 48 };

/** The chip shows when the ticket has been open for more than 24 hours or in progress for more than 48 hours (exactly the limit is not yet "long"). */
export function isWaitingLong(status: DemoTicketStatus, statusSince: string | Date, now: Date): boolean {
  const limit = DEMO_TICKET_WAITING_HOURS[status];
  if (limit === undefined) return false;
  return now.getTime() - new Date(statusSince).getTime() > limit * 60 * 60 * 1000;
}
// demo-ticket:end
