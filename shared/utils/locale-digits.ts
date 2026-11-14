import { normalizeDigits } from "./phone";

export type DigitLocale = "fa" | "en";

const PERSIAN_ZERO = 0x06f0;

/** Rewrites ASCII digits as Persian digits for `fa`; `en` shows Western digits. Other characters stay. */
export function toLocaleDigits(value: string, locale: DigitLocale): string {
  const ascii = normalizeDigits(value);
  if (locale !== "fa") return ascii;
  return ascii.replace(/[0-9]/g, (digit) => String.fromCharCode(PERSIAN_ZERO + Number(digit)));
}

/** `+989120000000` -> `0912 000 0000` in the locale's digits, as shown on the code step. */
export function formatPhoneForDisplay(phoneE164: string, locale: DigitLocale): string {
  const match = /^\+98(9\d{2})(\d{3})(\d{4})$/.exec(phoneE164);
  const text = match ? `0${match[1]} ${match[2]} ${match[3]}` : phoneE164;
  return toLocaleDigits(text, locale);
}
