// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  IP_LIMITS,
  PHONE_CHANGE_USER_LIMITS,
  PHONE_LIMITS,
  resendRetryAfter,
  rollingLimitRetryAfter,
} from "../../../server/services/otp-limits";

const NOW = new Date("2026-10-18T12:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

describe("resendRetryAfter", () => {
  it("is null with no previous send and at exactly 30 seconds", () => {
    expect(resendRetryAfter([], NOW)).toBeNull();
    expect(resendRetryAfter([ago(30)], NOW)).toBeNull();
    expect(resendRetryAfter([ago(400)], NOW)).toBeNull();
  });

  it("returns the remaining seconds, rounded up", () => {
    expect(resendRetryAfter([ago(10)], NOW)).toBe(20);
    expect(resendRetryAfter([ago(29.2)], NOW)).toBe(1);
    expect(resendRetryAfter([ago(0)], NOW)).toBe(30);
  });
});

describe("rollingLimitRetryAfter", () => {
  const sends = (secondsAgo: number[]) => secondsAgo.map(ago);

  it("allows up to the limit", () => {
    expect(rollingLimitRetryAfter(sends([60, 120, 180, 240]), NOW, PHONE_LIMITS)).toBeNull();
  });

  it("blocks the 6th phone send in an hour until the 5th most recent ages out", () => {
    const five = sends([100, 200, 300, 400, 500]);
    // the 5th most recent (500 s ago) leaves the hour in 3100 s
    expect(rollingLimitRetryAfter(five, NOW, PHONE_LIMITS)).toBe(3100);
  });

  it("ignores sends outside the window", () => {
    const old = sends([3601, 3700, 4000, 5000, 6000]);
    expect(rollingLimitRetryAfter(old, NOW, PHONE_LIMITS)).toBeNull();
  });

  it("enforces the daily phone limit with the longer retry", () => {
    const ten = sends([4000, 5000, 6000, 7000, 8000, 9000, 10_000, 11_000, 12_000, 13_000]);
    expect(rollingLimitRetryAfter(ten, NOW, PHONE_LIMITS)).toBe(86_400 - 13_000);
  });

  it("takes the larger wait when both windows are exceeded", () => {
    const burst = sends([10, 20, 30, 40, 50, 4000, 5000, 6000, 7000, 8000]);
    expect(rollingLimitRetryAfter(burst, NOW, PHONE_LIMITS)).toBe(86_400 - 8000);
  });

  it("applies the IP limits of 30 per hour and 100 per day", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => ago(10 + i));
    expect(rollingLimitRetryAfter(thirty.slice(0, 29), NOW, IP_LIMITS)).toBeNull();
    expect(rollingLimitRetryAfter(thirty, NOW, IP_LIMITS)).toBe(3600 - 39);
    const hundred = Array.from({ length: 100 }, (_, i) => ago(4000 + i * 100));
    expect(rollingLimitRetryAfter(hundred, NOW, IP_LIMITS)).toBe(86_400 - (4000 + 99 * 100));
  });

  it("caps phone-change sends at 5 per User per hour", () => {
    expect(rollingLimitRetryAfter([10, 70, 130, 190].map(ago), NOW, PHONE_CHANGE_USER_LIMITS)).toBeNull();
    expect(rollingLimitRetryAfter([10, 70, 130, 190, 250].map(ago), NOW, PHONE_CHANGE_USER_LIMITS)).toBe(3350);
  });
});
