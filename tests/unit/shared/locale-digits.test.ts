// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseApiError } from "~~/shared/utils/api-error-client";
import { formatPhoneForDisplay, toLocaleDigits } from "~~/shared/utils/locale-digits";

describe("toLocaleDigits", () => {
  it("shows Persian digits in fa and Western digits in en, whatever script came in", () => {
    expect(toLocaleDigits("0912 123", "fa")).toBe("۰۹۱۲ ۱۲۳");
    expect(toLocaleDigits("۰۹۱۲ ۱۲۳", "en")).toBe("0912 123");
    expect(toLocaleDigits("٠٩١٢", "fa")).toBe("۰۹۱۲");
    expect(toLocaleDigits("ab-1", "fa")).toBe("ab-۱");
  });
});

describe("formatPhoneForDisplay", () => {
  it("renders +989120000000 as 0912 000 0000 in locale digits", () => {
    expect(formatPhoneForDisplay("+989120000000", "en")).toBe("0912 000 0000");
    expect(formatPhoneForDisplay("+989120000000", "fa")).toBe("۰۹۱۲ ۰۰۰ ۰۰۰۰");
  });
  it("leaves an unexpected value readable", () => {
    expect(formatPhoneForDisplay("+12025550123", "en")).toBe("+12025550123");
  });
});

describe("parseApiError", () => {
  it("reads the standard body", () => {
    expect(parseApiError({ status: 429, data: { data: { code: "otp_rate_limited", retryAfter: 600 } } })).toEqual({
      code: "otp_rate_limited",
      retryAfter: 600,
      status: 429,
      network: false,
    });
  });
  it("treats an error without a response as a network failure", () => {
    expect(parseApiError(new TypeError("fetch failed"))).toMatchObject({ network: true, code: null, status: null });
  });
  it("is not a network failure when the server answered without a code", () => {
    expect(parseApiError({ status: 500, response: {} })).toMatchObject({ network: false, code: null, status: 500 });
  });
});
