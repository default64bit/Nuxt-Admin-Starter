// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatTimeText, joinInstant, parseDateText, parseTimeText, splitInstant, tehranParts, tehranToday } from "~~/shared/utils/tehran-time";

// Asia/Tehran has been UTC+3:30 all year since the 2022 clock change; before that it was UTC+4:30 in
// summer. Every expectation below holds whatever time zone the test process runs in (run with TZ=...).

describe("Tehran midnight", () => {
  it("is 20:30 UTC on the previous day", () => {
    expect(joinInstant("2026-03-21", "00:00")).toBe("2026-03-20T20:30:00.000Z"); // 1 Farvardin 1405
    expect(joinInstant("2026-10-25", "00:00")).toBe("2026-10-24T20:30:00.000Z");
    expect(joinInstant("2026-01-01", "00:00")).toBe("2025-12-31T20:30:00.000Z"); // across the year
  });

  it("splits back to the same date and 00:00", () => {
    expect(splitInstant("2026-03-20T20:30:00.000Z")).toEqual({ date: "2026-03-21", time: "00:00" });
    expect(splitInstant("2025-12-31T20:30:00.000Z")).toEqual({ date: "2026-01-01", time: "00:00" });
  });

  it("flips the date at exactly midnight: 23:59:59.999 is still the day before", () => {
    expect(splitInstant("2026-03-20T20:29:59.999Z")).toEqual({ date: "2026-03-20", time: "23:59" });
    expect(splitInstant("2026-03-20T20:30:00.000Z")).toEqual({ date: "2026-03-21", time: "00:00" });
    expect(tehranParts("2026-03-20T20:29:59.999Z")).toMatchObject({ day: 20, hour: 23, minute: 59, second: 59 });
  });

  it("puts a UTC evening on the next Tehran day", () => {
    expect(splitInstant("2026-06-15T21:00:00.000Z").date).toBe("2026-06-16"); // 00:30 on the 16th in Tehran
    expect(splitInstant("2026-06-15T20:00:00.000Z").date).toBe("2026-06-15"); // 23:30 on the 15th
    expect(tehranToday(new Date("2026-06-15T21:00:00.000Z"))).toBe("2026-06-16");
  });
});

describe("date boundaries", () => {
  it("handles month and year ends, and a leap day", () => {
    expect(joinInstant("2026-12-31", "23:59")).toBe("2026-12-31T20:29:00.000Z");
    expect(splitInstant("2026-12-31T20:30:00.000Z")).toEqual({ date: "2027-01-01", time: "00:00" });
    expect(joinInstant("2028-02-29", "12:00")).toBe("2028-02-29T08:30:00.000Z");
    expect(splitInstant("2028-02-29T08:30:00.000Z")).toEqual({ date: "2028-02-29", time: "12:00" });
  });

  it("round-trips every quarter hour of a day, and across a year of days", () => {
    for (let minutes = 0; minutes < 1440; minutes += 15) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      expect(splitInstant(joinInstant("2026-09-10", time)!), time).toEqual({ date: "2026-09-10", time });
    }
    for (let day = 0; day < 366; day += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      expect(splitInstant(joinInstant(date, "00:00")!).date, date).toBe(date);
    }
  });

  it("rejects dates that do not exist", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "2026-04-31", "2027-02-29", "26-01-01", "2026-1-1", ""]) expect(joinInstant(bad, "10:00"), bad).toBeNull();
    expect(parseDateText("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseDateText("2026-02-29")).toBeNull();
  });
});

describe("daylight saving time before 2023", () => {
  it("uses +4:30 in summer 2021 and +3:30 in winter 2021", () => {
    expect(joinInstant("2021-07-01", "00:00")).toBe("2021-06-30T19:30:00.000Z");
    expect(joinInstant("2021-12-01", "00:00")).toBe("2021-11-30T20:30:00.000Z");
    expect(splitInstant("2021-06-30T19:30:00.000Z")).toEqual({ date: "2021-07-01", time: "00:00" });
  });

  it("settles a time that never existed on the next valid wall-clock time, and keeps the day for an ambiguous one", () => {
    // The clocks went forward at 00:00 on 22 March 2021: 00:30 did not exist that night.
    const skipped = joinInstant("2021-03-22", "00:30")!;
    expect(splitInstant(skipped)).toEqual({ date: "2021-03-22", time: "01:30" });
    // The clocks went back at 24:00 on 21 September 2021 (to 23:00): 23:30 on the 21st happened twice.
    expect(splitInstant(joinInstant("2021-09-21", "23:30")!).date).toBe("2021-09-21");
  });

  it("is the plain +3:30 from 2023 on", () => {
    for (const month of ["01", "04", "07", "10"]) expect(joinInstant(`2024-${month}-15`, "00:00"), month).toBe(`2024-${month}-14T20:30:00.000Z`);
  });
});

describe("typed times", () => {
  it("accepts H:mm, HH:mm and HHmm in Western, Persian and Arabic-Indic digits", () => {
    expect(parseTimeText("14:35")).toEqual({ hour: 14, minute: 35 });
    expect(parseTimeText("9:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseTimeText("0905")).toEqual({ hour: 9, minute: 5 });
    expect(parseTimeText("۱۴:۳۵")).toEqual({ hour: 14, minute: 35 });
    expect(parseTimeText("١٤:٣٥")).toEqual({ hour: 14, minute: 35 });
    expect(parseTimeText(" 00:00 ")).toEqual({ hour: 0, minute: 0 });
    expect(parseTimeText("23:59")).toEqual({ hour: 23, minute: 59 });
  });

  it("rejects what is not a 24-hour time of day", () => {
    for (const bad of ["24:00", "12:60", "7:5", "abc", "", "12", "12:345", "-1:00", "1:2:3"]) expect(parseTimeText(bad), bad).toBeNull();
  });

  it("joins a typed time into the right instant, in Persian digits too", () => {
    expect(joinInstant("2026-03-21", "۱۴:۳۵")).toBe("2026-03-21T11:05:00.000Z");
    expect(joinInstant("2026-03-21", "25:00")).toBeNull();
    expect(joinInstant("2026-03-21", { hour: 23, minute: 59 })).toBe("2026-03-21T20:29:00.000Z");
  });

  it("formats a time in the locale's digits", () => {
    expect(formatTimeText(9, 5, "en")).toBe("09:05");
    expect(formatTimeText(9, 5, "fa")).toBe("۰۹:۰۵");
  });
});
