import type { Locale } from "./database-enums";
import type { PermissionKey } from "./permissions";

// The Notification event catalogue (ADR-0021): one entry per kind of Inbox item. Typed constants shared by the server
// (recording, Channels) and the client (Inbox, icons), so keys, tokens, Permission, link and copy live in one place. A
// Project adds an event by adding an entry here and an icon and tint in `app/components/admin/inbox-icons.ts`; the
// completeness test fails when a field, a translation or an icon is missing.
//
// The copy is catalogue data, not an i18n message: a Channel speaks the recipient's Message language, which can differ
// from the language of the page that raised the event. fa copy is a draft awaiting approval (i18n/unapproved.md).

export interface AttentionSource {
  type: string;
  id: string;
}

export interface AttentionDefinition<Ids> {
  /** A short title: the Inbox's Type select and the bold first line of a Channel message. */
  title: Record<Locale, string>;
  /** Non-personal token names, at most three; never free text a User typed. Stored raw; the reader formats them for its locale. */
  tokens: readonly string[];
  /** Copy with `{1}`..`{3}` for the tokens in `tokens`. */
  copy: Record<Locale, string>;
  /** The Permission that gates the item; checked at read time, every time. */
  permission: PermissionKey;
  /** Admin-panel path without a locale prefix, from the id of the item's source entity. */
  link: (sourceId: string) => string;
  /** One item per logical occurrence: a replay with the same key records nothing. */
  dedupe: (ids: Ids) => string;
  source: (ids: Ids) => AttentionSource;
}

export const ATTENTION_TYPES = {
  // demo-ticket:start
  // Raised for the new assignee when someone else assigns a demo ticket. Each assignment is its own item (the dedupe key
  // carries the assignment time) and the item closes when the ticket is resolved, closed, reassigned or deleted.
  "demo_ticket.assigned": {
    title: { en: "Demo ticket assigned to you", fa: "تیکت آزمایشی به شما سپرده شد" },
    tokens: ["priority"],
    copy: { en: "A demo ticket with {1} priority was assigned to you.", fa: "یک تیکت آزمایشی با اولویت {1} به شما سپرده شد." },
    permission: "view-demo-tickets",
    link: (ticketId: string) => `/admin/demo-tickets?ticket=${ticketId}`,
    dedupe: (ids: { ticketId: string; assignedAt: string }) => `attention:demo-ticket-assigned:${ids.ticketId}:${ids.assignedAt}`,
    source: (ids: { ticketId: string; assignedAt: string }) => ({ type: "demo_ticket", id: ids.ticketId }),
  },
  // demo-ticket:end
} as const satisfies Record<string, AttentionDefinition<never>>;

export type AttentionType = keyof typeof ATTENTION_TYPES;
export type AttentionIds<T extends AttentionType> = Parameters<(typeof ATTENTION_TYPES)[T]["dedupe"]>[0];

export const ATTENTION_TYPE_KEYS = Object.keys(ATTENTION_TYPES) as AttentionType[];

export const attentionDedupeKey = <T extends AttentionType>(type: T, ids: AttentionIds<T>): string => (ATTENTION_TYPES[type].dedupe as (i: AttentionIds<T>) => string)(ids);
export const attentionSource = <T extends AttentionType>(type: T, ids: AttentionIds<T>): AttentionSource => (ATTENTION_TYPES[type].source as (i: AttentionIds<T>) => AttentionSource)(ids);
export const attentionLink = (type: AttentionType, sourceId: string): string => (ATTENTION_TYPES[type].link as (id: string) => string)(sourceId);

/** The types a User holding these Permissions can see in the Inbox (the Type select offers exactly these). */
export const visibleAttentionTypes = (permissions: readonly string[]): AttentionType[] => ATTENTION_TYPE_KEYS.filter((type) => permissions.includes(ATTENTION_TYPES[type].permission));

/** Fills `{1}`..`{3}` with the tokens, in order. */
export function renderCopy(copy: string, tokens: readonly string[]): string {
  return copy.replace(/\{(\d)\}/g, (_, index: string) => tokens[Number(index) - 1] ?? "");
}
