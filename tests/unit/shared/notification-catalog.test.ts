import { describe, expect, it } from "vitest";
import { INBOX_TYPE_COLORS, INBOX_TYPE_ICONS } from "../../../app/components/admin/inbox-icons";
import { LOCALES } from "../../../shared/constants/database-enums";
import { ATTENTION_TYPES, ATTENTION_TYPE_KEYS } from "../../../shared/constants/notification-catalog";
import { PERMISSION_KEYS } from "../../../shared/constants/permissions";
import { renderAttentionText } from "../../../shared/utils/attention-message";

// The completeness test of ADR-0021: an event without a field, a translation or an icon fails here.
describe("notification catalogue", () => {
  it.each(ATTENTION_TYPE_KEYS)("%s is complete", (type) => {
    const definition = ATTENTION_TYPES[type];
    expect(PERMISSION_KEYS).toContain(definition.permission);
    expect(definition.tokens.length).toBeLessThanOrEqual(3);
    for (const locale of LOCALES) {
      expect(definition.title[locale].trim(), `${type} title ${locale}`).not.toBe("");
      expect(definition.copy[locale].trim(), `${type} copy ${locale}`).not.toBe("");
      // Every token placeholder has a token and the copy leaves none unfilled.
      const rendered = renderAttentionText(type, definition.tokens.map(() => "x"), locale);
      expect(rendered, `${type} ${locale}`).not.toMatch(/\{\d\}/);
      expect(rendered).toContain("x");
    }
    expect(definition.link("00000000-0000-4000-8000-000000000000").startsWith("/admin")).toBe(true);
    expect(INBOX_TYPE_ICONS[type], `${type} icon`).toBeTruthy();
    expect(INBOX_TYPE_COLORS[type], `${type} tint`).toBeTruthy();
  });

  it("has an icon and a tint only for catalogue events", () => {
    expect(Object.keys(INBOX_TYPE_ICONS).sort()).toEqual([...ATTENTION_TYPE_KEYS].sort());
    expect(Object.keys(INBOX_TYPE_COLORS).sort()).toEqual([...ATTENTION_TYPE_KEYS].sort());
  });
});
