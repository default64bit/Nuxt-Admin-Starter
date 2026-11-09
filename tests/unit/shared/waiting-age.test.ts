import { describe, expect, it } from "vitest";
import { waitingAge } from "../../../shared/utils/waiting-age";

const NOW = new Date("2026-10-25T12:00:00Z");

describe("waitingAge", () => {
  it("uses the largest whole unit", () => {
    expect(waitingAge("2026-10-25T11:59:30Z", NOW)).toEqual({ unit: "minutes", n: 0 });
    expect(waitingAge("2026-10-25T11:15:00Z", NOW)).toEqual({ unit: "minutes", n: 45 });
    expect(waitingAge("2026-10-25T11:00:00Z", NOW)).toEqual({ unit: "hours", n: 1 });
    expect(waitingAge("2026-10-25T09:10:00Z", NOW)).toEqual({ unit: "hours", n: 2 });
    expect(waitingAge("2026-10-24T12:00:00Z", NOW)).toEqual({ unit: "days", n: 1 });
    expect(waitingAge("2026-10-20T00:00:00Z", NOW)).toEqual({ unit: "days", n: 5 });
  });

  it("never goes negative", () => {
    expect(waitingAge("2026-10-25T12:05:00Z", NOW)).toEqual({ unit: "minutes", n: 0 });
  });
});
