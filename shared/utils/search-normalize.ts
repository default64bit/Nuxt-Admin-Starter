/**
 * Search text normalization (catalog-browsing spec). It is the single definition used for both the
 * user's query and the stored `search_text` columns, so matching is consistent: a write path that
 * fills `search_text` MUST call this on the concatenated names it indexes.
 *
 * Unifies Arabic/Persian Yeh and Kaf, drops Arabic diacritics, tatweel and zero-width non-joiners,
 * maps Persian and Arabic-Indic digits to ASCII, strips Latin diacritics, lowercases and collapses
 * whitespace.
 */
const YEH = /[يىئ]/g; // Arabic Yeh, Alef Maksura, Yeh with hamza -> Persian Yeh
const KAF = /[ك]/g;
const ARABIC_MARKS = /[ً-ٰٟـ‌]/g; // harakat, superscript alef, tatweel, ZWNJ
const LATIN_MARKS = /[̀-ͯ]/g;

const digitValue = (char: string) => {
  const code = char.charCodeAt(0);
  if (code >= 0x06f0 && code <= 0x06f9) return code - 0x06f0; // Persian
  if (code >= 0x0660 && code <= 0x0669) return code - 0x0660; // Arabic-Indic
  return -1;
};

export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(LATIN_MARKS, "")
    .replace(YEH, "ی")
    .replace(KAF, "ک")
    .replace(ARABIC_MARKS, "")
    .replace(/[٠-٩۰-۹]/g, (char) => String(digitValue(char)))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
