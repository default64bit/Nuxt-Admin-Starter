import type { AdminNavCounts } from "../schemas/admin-nav-counts";

// The live Inbox's pure rules: the poll cadence and what changed between two nav-counts answers.

export const NAV_POLL_MS = 20_000;
export const NAV_POLL_MAX_BACKOFF_MS = 120_000;

/** The wait before the next poll: 20 s, then 40 s, 80 s and at most 2 minutes after consecutive failures. */
export function navPollDelay(consecutiveFailures: number): number {
  return Math.min(NAV_POLL_MS * 2 ** Math.max(0, consecutiveFailures), NAV_POLL_MAX_BACKOFF_MS);
}

/** The queue counts that each own a list page, in `AdminNavCounts`. A Project adds one name per queue. */
export const NAV_QUEUE_COUNT_KEYS = [
  // demo-ticket:start
  "openDemoTickets",
  // demo-ticket:end
] as const satisfies readonly (keyof AdminNavCounts)[];
export type NavQueueCountKey = (typeof NAV_QUEUE_COUNT_KEYS)[number];

export interface NavCountsChange {
  /** The answer before this one; null for a tab's first answer (its baseline). */
  previous: AdminNavCounts | null;
  current: AdminNavCounts;
  /** `newest` points at another item (or none), so a new item arrived or the newest one was resolved. */
  newestMoved: boolean;
  /** Queue counts whose value differs (a key appearing or disappearing counts). */
  changedQueues: NavQueueCountKey[];
  /** `inboxUnread` differs. */
  unreadChanged: boolean;
  /** Anything differs; always false for the baseline. */
  changed: boolean;
}

/** What differs between two nav-counts answers; the first answer (no `previous`) is a baseline, never a change. */
export function diffNavCounts(previous: AdminNavCounts | null | undefined, current: AdminNavCounts): NavCountsChange {
  if (!previous) return { previous: null, current, newestMoved: false, changedQueues: [], unreadChanged: false, changed: false };
  const newestMoved = (previous.newest?.id ?? null) !== (current.newest?.id ?? null);
  const unreadChanged = previous.inboxUnread !== current.inboxUnread;
  const changedQueues = NAV_QUEUE_COUNT_KEYS.filter((key) => (previous as Partial<AdminNavCounts>)[key as keyof AdminNavCounts] !== (current as Partial<AdminNavCounts>)[key as keyof AdminNavCounts]);
  return { previous, current, newestMoved, changedQueues, unreadChanged, changed: newestMoved || unreadChanged || changedQueues.length > 0 };
}
