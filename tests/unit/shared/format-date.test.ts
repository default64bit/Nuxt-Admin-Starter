// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseFieldErrors } from "../../../shared/utils/api-error-client";
import { formatDate } from "../../../shared/utils/format-date";

describe("formatDate", () => {
  // 2026-10-19T21:00:00Z is already 2026-10-20 00:30 in Tehran (UTC+03:30), so the business day is the 20th.
  const instant = "2026-10-19T21:00:00.000Z";

  it("shows the Gregorian date in the business time zone with Western digits for en", () => {
    expect(formatDate(instant, "en")).toBe("20 Oct 2026");
  });

  it("shows the Jalali date with Persian digits for fa", () => {
    expect(formatDate(instant, "fa")).toBe("۲۸ مهر ۱۴۰۵");
  });
});

describe("parseFieldErrors", () => {
  it("reads field errors from the standard error body", () => {
    const error = { status: 409, data: { data: { code: "duplicate_name", fieldErrors: { name: ["duplicate_name"] } } } };
    expect(parseFieldErrors(error)).toEqual({ name: ["duplicate_name"] });
  });

  it("is empty when the body has none or is malformed", () => {
    expect(parseFieldErrors(new Error("offline"))).toEqual({});
    expect(parseFieldErrors({ data: { data: { fieldErrors: ["x"] } } })).toEqual({});
    expect(parseFieldErrors({ data: { data: { fieldErrors: { a: [1] } } } })).toEqual({});
  });
});
