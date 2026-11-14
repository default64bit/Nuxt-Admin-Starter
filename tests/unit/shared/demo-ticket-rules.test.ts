// demo-ticket:start (whole file)
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEMO_TICKET_STATUSES, DEMO_TICKET_STATUS_TONES } from "~~/shared/constants/demo-ticket";
import { isForwardStep, isWaitingLong, nextDemoTicketStatus } from "~~/shared/utils/demo-ticket-rules";

const NOW = new Date("2026-03-10T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

describe("demo ticket status flow", () => {
  it("moves forward one step at a time and ends at closed", () => {
    expect(DEMO_TICKET_STATUSES.map((status) => nextDemoTicketStatus(status))).toEqual(["in_progress", "resolved", "closed", null]);
  });

  it("allows exactly the next status: no skipping, staying, going back or reopening", () => {
    expect(isForwardStep("open", "in_progress")).toBe(true);
    expect(isForwardStep("resolved", "closed")).toBe(true);
    expect(isForwardStep("open", "resolved")).toBe(false);
    expect(isForwardStep("open", "open")).toBe(false);
    expect(isForwardStep("resolved", "in_progress")).toBe(false);
    expect(isForwardStep("closed", "open")).toBe(false);
  });

  it("maps statuses to the tones", () => {
    expect(DEMO_TICKET_STATUS_TONES).toEqual({ open: "info", in_progress: "progress", resolved: "success", closed: "neutral" });
  });
});

describe("waiting long", () => {
  it("is open for more than 24 hours, and exactly 24 hours is not yet long", () => {
    expect(isWaitingLong("open", hoursAgo(24), NOW)).toBe(false);
    expect(isWaitingLong("open", hoursAgo(24.01), NOW)).toBe(true);
    expect(isWaitingLong("open", hoursAgo(2), NOW)).toBe(false);
  });

  it("is in progress for more than 48 hours", () => {
    expect(isWaitingLong("in_progress", hoursAgo(30), NOW)).toBe(false);
    expect(isWaitingLong("in_progress", hoursAgo(48), NOW)).toBe(false);
    expect(isWaitingLong("in_progress", hoursAgo(49), NOW)).toBe(true);
  });

  it("never applies to resolved or closed tickets, and reads an ISO string", () => {
    expect(isWaitingLong("resolved", hoursAgo(500), NOW)).toBe(false);
    expect(isWaitingLong("closed", hoursAgo(500), NOW)).toBe(false);
    expect(isWaitingLong("open", hoursAgo(25).toISOString(), NOW)).toBe(true);
  });
});
// demo-ticket:end
