export type DateLocale = "fa" | "en";

/**
 * A stored UTC timestamp as a date in the business time zone (`Asia/Tehran`): Jalali with Persian
 * digits for `fa`, Gregorian with Western digits for `en` (localization spec).
 */
export function formatDate(iso: string | Date, locale: DateLocale): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian-nu-arabext" : "en-GB-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

const timeParts = (iso: string | Date, locale: DateLocale) => {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-nu-arabext" : "en-GB-u-nu-latn", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
};

/** The wall-clock time in the business time zone, 24-hour, in the locale's digits (`14:35`, `۱۴:۳۵`). */
export function formatTime(iso: string | Date, locale: DateLocale): string {
  return timeParts(iso, locale);
}

/** A stored UTC timestamp as the business-time-zone date and time: `24 Oct 2026, 00:00` or `۲ آبان ۱۴۰۵، ۰۰:۰۰`. */
export function formatDateTime(iso: string | Date, locale: DateLocale): string {
  return `${formatDate(iso, locale)}${locale === "fa" ? "، " : ", "}${formatTime(iso, locale)}`;
}
