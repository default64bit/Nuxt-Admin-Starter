// demo-ticket:start (whole file) -- the demo ticket list's URL state.
import { DEMO_TICKET_PRIORITIES, DEMO_TICKET_STATUSES, type DemoTicketPriority, type DemoTicketStatus } from "../constants/demo-ticket";
import { DEMO_TICKET_UNASSIGNED } from "../schemas/demo-ticket";

/** The list's URL state: `q`, the three filters, `page`, and `ticket` (the id whose dialog is open). */
export interface DemoTicketListState {
  q?: string;
  status?: DemoTicketStatus;
  priority?: DemoTicketPriority;
  /** A User id, or `none` for unassigned tickets. */
  assignee?: string;
  page: number;
  ticket?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const first = (value: unknown): string | undefined => {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === "string" ? single : undefined;
};

/** Reads the URL query; an unknown or invalid value is dropped (the client never sends it to the API). */
export function parseDemoTicketListUrl(query: Record<string, unknown>): DemoTicketListState {
  const page = Number(first(query.page));
  const q = first(query.q)?.trim();
  const state: DemoTicketListState = { page: Number.isInteger(page) && page >= 1 ? page : 1 };
  if (q) state.q = q.slice(0, 200);
  const status = DEMO_TICKET_STATUSES.find((candidate) => candidate === first(query.status));
  if (status) state.status = status;
  const priority = DEMO_TICKET_PRIORITIES.find((candidate) => candidate === first(query.priority));
  if (priority) state.priority = priority;
  const assignee = first(query.assignee);
  if (assignee === DEMO_TICKET_UNASSIGNED) state.assignee = assignee;
  else if (assignee && UUID.test(assignee)) state.assignee = assignee.toLowerCase();
  const ticket = first(query.ticket);
  if (ticket && UUID.test(ticket)) state.ticket = ticket.toLowerCase();
  return state;
}

/** The URL query for a state: only what differs from the defaults. */
export function buildDemoTicketListUrlQuery(state: DemoTicketListState): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.q) query.q = state.q;
  if (state.status) query.status = state.status;
  if (state.priority) query.priority = state.priority;
  if (state.assignee) query.assignee = state.assignee;
  if (state.page > 1) query.page = String(state.page);
  if (state.ticket) query.ticket = state.ticket;
  return query;
}

/** What the list query sends to the API: the URL state without the open dialog. */
export const demoTicketApiQuery = (state: DemoTicketListState): Record<string, string> => buildDemoTicketListUrlQuery({ ...state, ticket: undefined });
// demo-ticket:end
