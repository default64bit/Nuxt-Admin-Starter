export type DigitLocale = "fa" | "en";

const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

/** Turns Persian (۰-۹) and Arabic-Indic (٠-٩) digits into ASCII digits; everything else is untouched. */
function toAsciiDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (char) => {
    const code = char.charCodeAt(0);
    return String(code >= PERSIAN_ZERO ? code - PERSIAN_ZERO : code - ARABIC_INDIC_ZERO);
  });
}

/** Rewrites ASCII digits as Persian digits for `fa`; `en` shows Western digits. Other characters stay. */
export function toLocaleDigits(value: string, locale: DigitLocale): string {
  const ascii = toAsciiDigits(value);
  if (locale !== "fa") return ascii;
  return ascii.replace(/[0-9]/g, (digit) => String.fromCharCode(PERSIAN_ZERO + Number(digit)));
}
