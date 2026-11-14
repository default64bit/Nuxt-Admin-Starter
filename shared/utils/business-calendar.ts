import type { RangePresetKey } from "../constants/analytics";
import { joinInstant, splitInstant } from "./tehran-time";

// The Business calendar (`.specs/admin-dashboard/spec.md` "Ranges"): Tehran days, weeks
// from Saturday to Friday, Jalali months and years that start at Nowruz, whatever language or browser time zone.
// A range is a half-open window of UTC instants `[from, to)`; the window of a range that includes today ends at
// "now", so a comparison can stop at the same clock time. Nothing here reads the host time zone.

/** A Tehran day as a whole number of days since 1970-01-01 (the Gregorian date read as UTC). */
export type DayNumber = number;

const DAY_MS = 86_400_000;

export const dayNumber = (isoDate: string): DayNumber => Math.round(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
export const dayIso = (day: DayNumber): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** The Tehran day an instant falls on. */
export const tehranDay = (instant: Date | number): DayNumber => dayNumber(splitInstant(instant).date);

/** The instant a Tehran day starts (00:00 Asia/Tehran). */
export function startOfDay(day: DayNumber): Date {
  return new Date(joinInstant(dayIso(day), "00:00")!);
}

const jalaliFormat = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

/** The Jalali date of a Tehran day. */
export function jalaliOf(day: DayNumber): JalaliDate {
  const fields: Record<string, number> = {};
  for (const part of jalaliFormat.formatToParts(new Date(day * DAY_MS + DAY_MS / 2))) if (part.type === "year" || part.type === "month" || part.type === "day") fields[part.type] = Number(part.value);
  return { year: fields.year!, month: fields.month!, day: fields.day! };
}

/** Monday-first weekday numbers are not used: 0 is Saturday, the first day of the Business week, up to 6 for Friday. */
export function weekdayIndex(day: DayNumber): number {
  const sundayBased = new Date(day * DAY_MS).getUTCDay();
  return (sundayBased + 1) % 7;
}

export const weekStart = (day: DayNumber): DayNumber => day - weekdayIndex(day);
export const monthStart = (day: DayNumber): DayNumber => day - (jalaliOf(day).day - 1);

/** Nowruz (1 Farvardin) of the Jalali year the day falls in. */
export function yearStart(day: DayNumber): DayNumber {
  const { month, day: dayOfMonth } = jalaliOf(day);
  const before = month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30;
  return day - (before + dayOfMonth - 1);
}

export interface Window {
  from: Date;
  to: Date;
}

export interface ResolvedRange {
  key: RangePresetKey;
  /** The window; for a range that includes today it ends at `now`. */
  window: Window;
  /** The window it is compared with. */
  previous: Window;
  /** First and last Tehran day of the range (the last is today for a range that includes today). */
  firstDay: string;
  lastDay: string;
  includesToday: boolean;
}

function build(key: RangePresetKey, startDay: DayNumber, endDay: DayNumber, previousStartDay: DayNumber, previousEndDay: DayNumber, now: Date, wholePrevious = false): ResolvedRange {
  // `endDay` is exclusive. A window that reaches into today stops at `now`, and its comparison stops at the same
  // elapsed time into the matching earlier window, never past that window's own end.
  const from = startOfDay(startDay);
  const dayEnd = startOfDay(endDay);
  const includesToday = dayEnd.getTime() > now.getTime();
  const to = includesToday ? now : dayEnd;
  const previousFrom = startOfDay(previousStartDay);
  const previousDayEnd = startOfDay(previousEndDay);
  const previousTo = wholePrevious ? previousDayEnd : new Date(Math.min(previousDayEnd.getTime(), previousFrom.getTime() + (to.getTime() - from.getTime())));
  return { key, window: { from, to }, previous: { from: previousFrom, to: previousTo }, firstDay: dayIso(startDay), lastDay: dayIso(endDay - 1), includesToday };
}

/** A rolling range: today plus the days before it, compared with the same window moved back by its length. */
function rolling(key: RangePresetKey, today: DayNumber, length: number, endsToday: boolean, now: Date): ResolvedRange {
  const endDay = endsToday ? today + 1 : today;
  const startDay = endDay - length;
  return build(key, startDay, endDay, startDay - length, startDay, now);
}

/** The preset keys and how many days each rolling one spans. */
const ROLLING_DAYS: Partial<Record<RangePresetKey, { length: number; endsToday: boolean }>> = {
  today: { length: 1, endsToday: true },
  yesterday: { length: 1, endsToday: false },
  "last-7-days": { length: 7, endsToday: true },
  "last-30-days": { length: 30, endsToday: true },
  "last-90-days": { length: 90, endsToday: true },
};

/** Resolves a preset at `now` into its window and the window it is compared with. */
export function resolveRange(key: RangePresetKey, now: Date = new Date()): ResolvedRange {
  const today = tehranDay(now);
  const spec = ROLLING_DAYS[key];
  if (spec) return rolling(key, today, spec.length, spec.endsToday, now);
  switch (key) {
    case "this-week": {
      const start = weekStart(today);
      return build(key, start, today + 1, start - 7, start, now);
    }
    case "this-month": {
      const start = monthStart(today);
      return build(key, start, today + 1, monthStart(start - 1), start, now);
    }
    case "last-month": {
      const thisStart = monthStart(today);
      const start = monthStart(thisStart - 1);
      return build(key, start, thisStart, monthStart(start - 1), start, now, true);
    }
    case "this-year": {
      const start = yearStart(today);
      return build(key, start, today + 1, yearStart(start - 1), start, now);
    }
  }
  throw new Error(`Unknown range preset: ${key}`);
}

/** The result of comparing a figure with the previous period. */
export type Change = { kind: "percent"; percent: number } | { kind: "new" } | { kind: "none" };

/**
 * How a change is shown: a percentage (one decimal at most) when the previous value is not 0, "New" when it is 0 and
 * the current one is not, "—" when both are 0.
 */
export function changeOf(current: number, previous: number): Change {
  if (previous === 0) return current === 0 ? { kind: "none" } : { kind: "new" };
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  return { kind: "percent", percent: percent === 0 ? 0 : percent };
}
