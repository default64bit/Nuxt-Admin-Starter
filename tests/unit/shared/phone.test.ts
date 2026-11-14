// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeDigits, normalizeIranianMobile, normalizeIranianTelephone } from "~~/shared/utils/phone";

describe("normalizeIranianMobile", () => {
  it.each([
    "09121234567",
    "9121234567",
    "989121234567",
    "+989121234567",
    "00989121234567",
    "0912 123 4567",
    "0912-123-4567",
    " +98 912 123 45 67 ",
    "(0912) 123.4567",
    "۰۹۱۲۱۲۳۴۵۶۷",
    "٠٩١٢١٢٣٤٥٦٧",
    "+۹۸ ۹۱۲ ۱۲۳ ۴۵۶۷",
    "۰۰۹۸۹۱۲۱۲۳۴۵۶۷",
  ])("normalizes %j to +989121234567", (input) => {
    expect(normalizeIranianMobile(input)).toBe("+989121234567");
  });

  it("maps equivalent forms to the same value", () => {
    expect(normalizeIranianMobile("0912 000 0000")).toBe(normalizeIranianMobile("+989120000000"));
  });

  it.each([
    "",
    "   ",
    "0912123456",
    "091212345678",
    "02112345678",
    "+12025550123",
    "+989 12 abc 4567",
    "+98912123456",
    "0098",
    "08121234567",
    "+9981212345678",
    "09121234567x",
    "9121234567 9121234567",
  ])("rejects %j", (input) => {
    expect(normalizeIranianMobile(input)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(normalizeIranianMobile(undefined as never)).toBeNull();
    expect(normalizeIranianMobile(9121234567 as never)).toBeNull();
  });
});

describe("normalizeDigits", () => {
  it("turns Persian and Arabic-Indic digits into ASCII and leaves the rest", () => {
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeDigits("a-1 ۲")).toBe("a-1 2");
  });
});

describe("normalizeIranianTelephone (optional telephone: mobile or landline)", () => {
  it("normalizes a mobile like the sign-in normalizer", () => {
    expect(normalizeIranianTelephone("0912 000 0000")).toBe("+989120000000");
    expect(normalizeIranianTelephone("۰۹۱۲۰۰۰۰۰۰۰")).toBe("+989120000000");
  });
  it("normalizes landlines with an area code in every common spelling", () => {
    for (const input of ["021 1234 5678", "02112345678", "+98 21 12345678", "0098 21 1234-5678", "98 21 12345678", "(021) 12345678", "۰۲۱۱۲۳۴۵۶۷۸"]) {
      expect(normalizeIranianTelephone(input)).toBe("+982112345678");
    }
  });
  it("refuses numbers that are neither", () => {
    for (const input of ["", "12345", "021 1234 567", "021 1234 56789", "0012 12345678", "abc", "+1 212 555 0100", "0912 000 000"]) {
      expect(normalizeIranianTelephone(input)).toBeNull();
    }
    expect(normalizeIranianTelephone(undefined)).toBeNull();
  });
});
