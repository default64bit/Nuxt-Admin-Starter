import { formatDate, formatDateTime } from "~~/shared/utils/format-date";
import { formatPhoneForDisplay, toLocaleDigits } from "~~/shared/utils/locale-digits";
import { localizedPath } from "~~/shared/utils/locale-path";

/**
 * Locale-aware formatting for admin pages: digits, business-time dates (Jalali with Persian digits in `fa`,
 * Gregorian with Western digits in `en`), local phone forms and locale-prefixed paths.
 */
export function useAdminFormat() {
  const { t, te, locale } = useI18n();
  const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
  return {
    t,
    te,
    locale,
    digits,
    num: (value: number | string) => toLocaleDigits(String(value), digits.value),
    /** At most one decimal, in locale digits and decimal separator. */
    decimal: (value: number) => {
      const text = toLocaleDigits(new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value), digits.value);
      return digits.value === "fa" ? text.replace(".", "٫") : text;
    },
    date: (iso: string) => formatDate(iso, digits.value),
    dateTime: (iso: string) => formatDateTime(iso, digits.value),
    phone: (e164: string) => formatPhoneForDisplay(e164, digits.value),
    localePath: (path: string) => localizedPath(path, digits.value),
  };
}
