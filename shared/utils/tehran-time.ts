import { normalizeDigits } from "./phone";
import { toLocaleDigits, type DigitLocale } from "./locale-digits";

// Business time for admin forms (localization spec): a date and a time typed or picked in Asia/Tehran
// mean one UTC instant, whatever the browser's or the server's time zone is. Nothing here reads the
// host time zone: every conversion goes through Intl with the Asia/Tehran zone, so it also stays right
// for instants before 2023, when Iran still observed daylight saving time.

export const BUSINESS_TIME_ZONE = "Asia/Tehran";

export interface TehranParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The wall-clock fields (Gregorian calendar) an instant has in Asia/Tehran. */
export function tehranParts(instant: Date | string | number): TehranParts {
  const fields: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(instant))) if (part.type !== "literal") fields[part.type] = Number(part.value);
  return { year: fields.year!, month: fields.month!, day: fields.day!, hour: fields.hour!, minute: fields.minute!, second: fields.second! };
}

/** Minutes Asia/Tehran is ahead of UTC at an instant (210 now; 270 in the old summer time). */
function offsetMinutes(instantMs: number): number {
  const p = tehranParts(instantMs);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instantMs / 1000) * 1000) / 60_000;
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/** The Gregorian date and the 24-hour time an instant has in Asia/Tehran: `{ date: "2026-03-21", time: "00:00" }`. */
export function splitInstant(instant: Date | string | number): { date: string; time: string } {
  const p = tehranParts(instant);
  return { date: `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Today's Gregorian date in Asia/Tehran, which is not always the browser's today. */
export const tehranToday = (now: Date = new Date()) => splitInstant(now).date;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Splits `YYYY-MM-DD` into a real calendar date, or null (`2026-02-30` is not one). */
export function parseDateText(text: string): { year: number; month: number; day: number } | null {
  const match = DATE.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? { year, month, day } : null;
}

/**
 * A 24-hour time typed as `H:mm`, `HH:mm` or `HHmm`, in Western, Persian or Arabic-Indic digits; null
 * when it is not a time of day (`24:00` and `12:60` are not).
 */
export function parseTimeText(text: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(normalizeDigits(text.trim()).replace(/[٫.]/g, ":"));
  if (!match) return null;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/** The time as `HH:mm` in the locale's digits (`۱۴:۳۵` in fa). */
export function formatTimeText(hour: number, minute: number, locale: DigitLocale): string {
  return toLocaleDigits(`${pad(hour)}:${pad(minute)}`, locale);
}

/**
 * The UTC instant of a Gregorian date and a time of day in Asia/Tehran, as ISO text; null when the date
 * or time is not real. A time that did not exist (the hour skipped when the clocks went forward) lands
 * on the same wall-clock time one hour later.
 */
export function joinInstant(date: string, time: string | { hour: number; minute: number }): string | null {
  const day = parseDateText(date);
  const clock = typeof time === "string" ? parseTimeText(time) : time;
  if (!day || !clock) return null;
  const wallAsUtc = Date.UTC(day.year, day.month - 1, day.day, clock.hour, clock.minute);
  const first = wallAsUtc - offsetMinutes(wallAsUtc) * 60_000;
  const second = wallAsUtc - offsetMinutes(first) * 60_000;
  return new Date(second).toISOString();
}
