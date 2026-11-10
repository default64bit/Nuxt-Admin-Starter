import { ATTENTION_TYPES, renderCopy, type AttentionType } from "../constants/notification-catalog";
import type { Locale } from "../constants/database-enums";

// How an Inbox item's stored raw tokens read in a message for one locale. The Inbox and the Channels both use it, so a
// token reads the same everywhere. A token name without a formatter is shown as stored (a number, a code).

type TokenFormatter = (value: string, locale: Locale) => string;

const TOKEN_FORMATTERS: Record<string, TokenFormatter> = {
  // demo-ticket:start
  priority: (value, locale) => (({ low: { en: "low", fa: "کم" }, normal: { en: "normal", fa: "عادی" }, high: { en: "high", fa: "بالا" } }) as Record<string, Record<Locale, string>>)[value]?.[locale] ?? value,
  // demo-ticket:end
};

/** The short title of an event in a locale: the Inbox's Type select and the first line of a Channel message. */
export const attentionTitle = (type: AttentionType, locale: Locale): string => ATTENTION_TYPES[type].title[locale];

/** The message text of an Inbox item for a locale, with its tokens formatted (no link, no personal data). */
export function renderAttentionText(type: AttentionType, tokens: readonly string[], locale: Locale): string {
  const definition = ATTENTION_TYPES[type];
  const names = definition.tokens as readonly string[];
  const formatted = names.map((name, index) => {
    const value = tokens[index] ?? "";
    return TOKEN_FORMATTERS[name]?.(value, locale) ?? value;
  });
  return renderCopy(definition.copy[locale], formatted);
}
