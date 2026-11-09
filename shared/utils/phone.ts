const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

/** Turns Persian (۰-۹) and Arabic-Indic (٠-٩) digits into ASCII digits; everything else is untouched. */
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (char) => {
    const code = char.charCodeAt(0);
    return String(code >= PERSIAN_ZERO ? code - PERSIAN_ZERO : code - ARABIC_INDIC_ZERO);
  });
}

// Whitespace, dashes, dots and parentheses are allowed between digits; nothing else is.
const SEPARATORS = /[\s\-.()‌‏‎]/g;

/**
 * The one phone normalizer, shared by the browser and the server (authentication spec).
 * Accepts `09XXXXXXXXX`, `9XXXXXXXXX`, `989XXXXXXXXX`, `+989XXXXXXXXX` and `00989XXXXXXXXX` in any
 * digit script and returns the canonical `+989XXXXXXXXX`, or null for anything that is not an
 * Iranian mobile number (v1 serves Iran only).
 */
export function normalizeIranianMobile(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = normalizeDigits(input).replace(SEPARATORS, "");
  const match = /^(?:\+98|0098|98|0)?(9\d{9})$/.exec(cleaned);
  return match ? `+98${match[1]}` : null;
}

/**
 * An optional telephone: an Iranian mobile, or a landline with
 * its area code (`021 1234 5678`), in any digit script and spelling `normalizeIranianMobile` accepts.
 * Returns `+989XXXXXXXXX` or `+98AAXXXXXXXX`, or null. Syntax only; nothing is looked up.
 */
export function normalizeIranianTelephone(input: unknown): string | null {
  const mobile = normalizeIranianMobile(input);
  if (mobile) return mobile;
  if (typeof input !== "string") return null;
  const cleaned = normalizeDigits(input).replace(SEPARATORS, "");
  const match = /^(?:\+98|0098|98|0)?([1-8]\d{9})$/.exec(cleaned);
  return match ? `+98${match[1]}` : null;
}
