import { formatDate, type DateLocale } from "./format-date";

// Chart text (ADR-0025): Intl labels for a category axis, compact axis ticks and full tooltip dates. A Tehran day is a
// calendar date, so it is formatted from UTC noon of that date. Buckets are never placed on a Gregorian time scale.

const noon = (day: string) => new Date(`${day}T12:00:00Z`);
const labelLocale = (locale: DateLocale) => (locale === "fa" ? "fa-IR-u-ca-persian-nu-arabext" : "en-GB-u-ca-gregory-nu-latn");

/** The axis label of a day bucket: the short month and day (Jalali with Persian digits in `fa`). */
export function dayLabel(day: string, locale: DateLocale): string {
  return new Intl.DateTimeFormat(labelLocale(locale), { timeZone: "UTC", month: "short", day: "numeric" }).format(noon(day));
}

/** The full date of a day bucket, for a tooltip or a table row. */
export const dayPeriod = (day: string, locale: DateLocale): string => formatDate(noon(day), locale);

/** An axis tick: «۴۸ هزار» in `fa`, "48K" in `en`. */
export function compactTick(value: number, locale: DateLocale): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR-u-nu-arabext" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
