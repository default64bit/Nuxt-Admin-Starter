import { sql, type SQL } from "drizzle-orm";
import { users } from "../database/schema";

/** `%q%` with the LIKE metacharacters escaped, so a search text is always matched literally (`ILIKE`/`LIKE` escape with a backslash). */
export const containsPattern = (query: string) => `%${query.replace(/[\\%_]/g, "\\$&")}%`;

// The persisted names are raw text, so the stored side is normalized in SQL the way `normalizeSearchText` normalizes
// the query: Arabic Yeh, Alef Maksura and Yeh with hamza and Kaf become the Persian letters, Persian and Arabic-Indic
// digits become ASCII, and the zero-width non-joiner, tatweel and harakat are dropped (the characters past the
// replacement string are deleted). Latin diacritics are not folded on the stored side.
const FROM_CHARS = "يىئك٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹‌ـًٌٍَُِّْٰٟ";
const TO_CHARS = "ییی" + "ک" + "0123456789" + "0123456789";

/** Any stored text expression, normalized the way the account names are (see above). */
export const normalizedText = (expression: SQL) => sql`lower(translate(btrim(${expression}), ${FROM_CHARS}, ${TO_CHARS}))`;

/** The searchable full name of an account: given and family name, normalized. */
export const normalizedName = normalizedText(sql`coalesce(${users.givenName}, '') || ' ' || coalesce(${users.familyName}, '')`);
