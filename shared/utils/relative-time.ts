import type { DateLocale } from "./format-date";
import { waitingAge } from "./waiting-age";

const UNIT: Record<ReturnType<typeof waitingAge>["unit"], Intl.RelativeTimeFormatUnit> = { minutes: "minute", hours: "hour", days: "day" };

/**
 * How long ago a moment was, in the locale's words and digits ("5 minutes ago", «۵ دقیقه پیش»): minutes below an
 * hour, hours below a day, days after. Under a minute reads as "now".
 */
export function formatRelativeTime(iso: string | Date, now: Date, locale: DateLocale): string {
  const { unit, n } = waitingAge(iso, now);
  const formatter = new Intl.RelativeTimeFormat(locale === "fa" ? "fa-IR-u-nu-arabext" : "en", { numeric: "auto" });
  return formatter.format(-n, UNIT[unit]);
}
