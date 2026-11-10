import type { InboxItem } from "../schemas/admin-notifications";
import { encodeInboxCursor, parseInboxCursor } from "./inbox-cursor";

// The live Inbox's alert decision: which new items alert, how, and where the shared "last alerted at" marker moves.
// Pure: the tab, the storage and the toasts live in the composable.

/** The `(createdAt, id)` position of an item, as the wire cursor carries it. */
export interface AlertCursor {
  createdAt: string;
  id: string;
}

/** The `localStorage` key of the marker the browser's tabs share. */
export const LAST_ALERTED_STORAGE_KEY = "admin:last-alerted";
/** Up to this many new items get a toast each; more get one summary. */
export const MAX_SINGLE_TOASTS = 2;
export const ALERT_TOAST_MS = 10_000;

export function compareAlertCursors(a: AlertCursor, b: AlertCursor): number {
  const byTime = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (byTime !== 0) return byTime;
  const left = a.id.toLowerCase();
  const right = b.id.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The latest of the given cursors (missing ones ignored), or null when none is given. */
export function latestCursor(...cursors: (AlertCursor | null | undefined)[]): AlertCursor | null {
  let latest: AlertCursor | null = null;
  for (const cursor of cursors) if (cursor && (!latest || compareAlertCursors(cursor, latest) > 0)) latest = cursor;
  return latest;
}

/** A stored marker, or null when it is missing or malformed (storage is never trusted). */
export function parseStoredCursor(raw: string | null | undefined): AlertCursor | null {
  const parsed = raw ? parseInboxCursor(raw) : null;
  return parsed ? { createdAt: parsed.createdAt.toISOString(), id: parsed.id } : null;
}

export const serializeCursor = (cursor: AlertCursor): string => encodeInboxCursor(cursor);

/** What a tab already knows: its baseline (the newest item of its first answer), the shared marker and its own memory of the marker. */
export function alertFloor(known: { baseline: AlertCursor | null; stored: AlertCursor | null; local: AlertCursor | null }): AlertCursor | null {
  return latestCursor(known.baseline, known.stored, known.local);
}

/** Whether the newest item is past the floor, i.e. whether fetching new items can find anything. */
export function shouldFetchNew(newest: AlertCursor | null, floor: AlertCursor | null): boolean {
  if (!newest) return false;
  return !floor || compareAlertCursors(newest, floor) > 0;
}

/** The Inbox page itself, in either locale: its list updates in place, so it gets no toast. */
export function isNotificationsPagePath(path: string): boolean {
  return /^(\/en)?\/admin\/notifications\/?$/.test(path);
}

export interface AlertPlan {
  /** `each`: one toast per item in `items`; `summary`: one toast for `count`; `none`: no toast. */
  toasts: "none" | "each" | "summary";
  /** The items to alert, oldest first (so the newest toast lands on top). */
  items: InboxItem[];
  /** How many new items the batch holds (the server total when the answer was cut short). */
  count: number;
  /** The chime and the bell ring: once per non-empty batch, even on the Inbox page. */
  alert: boolean;
  /** Where the shared marker moves; null when nothing alerted. */
  advanceTo: AlertCursor | null;
}

const NOTHING: AlertPlan = { toasts: "none", items: [], count: 0, alert: false, advanceTo: null };

/**
 * One batch from `GET notifications?tab=open&after=<floor>`. Only unresolved items strictly newer than `floor` alert:
 * an item resolved before any poll saw it never does. 1-2 items get a toast each, 3 or more one summary.
 */
export function planAlerts(input: { items: readonly InboxItem[]; total?: number; floor: AlertCursor | null; onNotificationsPage: boolean }): AlertPlan {
  const fresh = input.items
    .filter((item) => item.resolvedAt === null && (!input.floor || compareAlertCursors(item, input.floor) > 0))
    .sort((a, b) => compareAlertCursors(a, b));
  if (fresh.length === 0) return NOTHING;
  const count = Math.max(fresh.length, input.total ?? 0);
  const toasts = input.onNotificationsPage ? "none" : count <= MAX_SINGLE_TOASTS ? "each" : "summary";
  const newest = fresh[fresh.length - 1]!;
  return { toasts, items: fresh, count, alert: true, advanceTo: { createdAt: newest.createdAt, id: newest.id } };
}
