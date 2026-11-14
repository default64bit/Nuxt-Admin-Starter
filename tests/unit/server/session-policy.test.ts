// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SESSION_POLICY, absoluteExpiryFrom, idleExpiryFrom, isSessionLive, shouldWriteActivity } from "../../../server/services/session-policy";

const T0 = new Date("2026-10-18T00:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe("session policy", () => {
  it("is 30 minutes idle and 12 hours absolute, for every User", () => {
    expect(SESSION_POLICY).toEqual({ idleSeconds: 1800, absoluteSeconds: 43_200 });
    expect(absoluteExpiryFrom(T0)).toEqual(at(43_200));
    expect(idleExpiryFrom(T0)).toEqual(at(1800));
  });

  it("ends a session at the idle window or the absolute window, whichever comes first, and on revocation", () => {
    const session = { createdAt: T0, lastSeenAt: T0, revokedAt: null };
    expect(isSessionLive(session, at(1799))).toBe(true);
    expect(isSessionLive(session, at(1801))).toBe(false);
    // Active to the end, but 12 hours after creation it is over.
    const active = { createdAt: T0, lastSeenAt: at(43_190), revokedAt: null };
    expect(isSessionLive(active, at(43_199))).toBe(true);
    expect(isSessionLive(active, at(43_201))).toBe(false);
    expect(isSessionLive({ ...session, revokedAt: T0 }, at(1))).toBe(false);
  });

  it("throttles activity writes to one per 60 seconds", () => {
    expect(shouldWriteActivity(T0, at(59))).toBe(false);
    expect(shouldWriteActivity(T0, at(60))).toBe(true);
  });
});
