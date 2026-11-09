// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "~~/shared/utils/search-normalize";

describe("normalizeSearchText", () => {
  it("unifies Arabic and Persian Yeh", () => {
    expect(normalizeSearchText("علي")).toBe(normalizeSearchText("علی"));
    expect(normalizeSearchText("موسى")).toBe(normalizeSearchText("موسی"));
    expect(normalizeSearchText("ي")).toBe("ی");
  });

  it("unifies Arabic Kaf with Persian Keheh", () => {
    expect(normalizeSearchText("كاج")).toBe(normalizeSearchText("کاج"));
    expect(normalizeSearchText("ك")).toBe("ک");
  });

  it("removes Arabic diacritics and tatweel", () => {
    expect(normalizeSearchText("عَطْر")).toBe("عطر");
    expect(normalizeSearchText("عطـــر")).toBe("عطر");
  });

  it("removes zero-width non-joiners so spaced and joined spellings meet", () => {
    expect(normalizeSearchText("می‌روم")).toBe(normalizeSearchText("میروم"));
  });

  it("maps Persian and Arabic-Indic digits to ASCII", () => {
    expect(normalizeSearchText("۵۰ میلی‌لیتر")).toBe("50 میلیلیتر");
    expect(normalizeSearchText("٥٠")).toBe("50");
  });

  it("lowercases English and strips Latin diacritics", () => {
    expect(normalizeSearchText("Chanel N°5")).toBe("chanel n°5");
    expect(normalizeSearchText("Café Crème")).toBe("cafe creme");
  });

  it("collapses and trims whitespace of every kind", () => {
    expect(normalizeSearchText("  rose \t\n  water  ")).toBe("rose water");
    expect(normalizeSearchText("rose water")).toBe("rose water");
  });

  it("is idempotent and returns an empty string for blank input", () => {
    const once = normalizeSearchText("  عَلي  كاج  Rose ");
    expect(normalizeSearchText(once)).toBe(once);
    expect(normalizeSearchText("   ")).toBe("");
    expect(normalizeSearchText("")).toBe("");
  });

  it("keeps ordinary Persian and English letters intact", () => {
    expect(normalizeSearchText("گل رز")).toBe("گل رز");
    expect(normalizeSearchText("oud")).toBe("oud");
  });
});
