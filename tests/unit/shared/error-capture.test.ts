import { describe, expect, it, vi } from "vitest";
import { reportingFromDsn } from "../../../server/utils/csp";
import { buildCaptureOptions, initErrorCapture, scrubEvent } from "../../../shared/utils/error-capture";

const DSN = "https://abc123@errors.app.example/7";

describe("error capture is gated by the DSN", () => {
  it("is not configured for an empty or malformed DSN: no options and no CSP report endpoint", () => {
    for (const dsn of [undefined, "", "   ", "not a dsn", "https://errors.app.example/7"]) {
      expect(buildCaptureOptions({ dsn })).toBeUndefined();
      expect(reportingFromDsn(dsn)).toBeUndefined();
    }
  });

  it("is configured for errors only once a DSN is set", () => {
    const options = buildCaptureOptions({ dsn: DSN, environment: "staging" });
    expect(options).toMatchObject({ dsn: DSN, environment: "staging", sendDefaultPii: false });
    expect(options).not.toHaveProperty("tracesSampleRate");
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(reportingFromDsn(DSN)?.reportUri).toBe("https://errors.app.example/api/7/security/?glitchtip_key=abc123");
  });

  it("scrubs request data, identity, phone numbers and OTP values before sending", () => {
    const event = scrubEvent({
      user: { id: "u1", phone: "+989121234567" },
      message: "sign-in failed for +98 912 123 4567 with otp=123456",
      exception: { values: [{ value: "bad code: 998877" }] },
      request: {
        url: "https://admin.app.example/sign-in?token=abc",
        cookies: { session: "s" },
        data: { phone: "09121234567" },
        headers: { cookie: "session=s", "user-agent": "test" },
      },
    });
    expect(event.user).toBeUndefined();
    expect(event.message).toBe("sign-in failed for [phone] with otp=[redacted]");
    expect(event.exception?.values?.[0]?.value).toBe("bad code: [redacted]");
    expect(event.request).toEqual({ url: "https://admin.app.example/sign-in", headers: { "user-agent": "test" } });
  });
});

describe("initErrorCapture", () => {
  it("never calls the SDK without a usable DSN", () => {
    const init = vi.fn();
    expect(initErrorCapture(init, { dsn: "" })).toBe(false);
    expect(initErrorCapture(init, { dsn: undefined })).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("calls the SDK once with the DSN when one is set", () => {
    const init = vi.fn();
    expect(initErrorCapture(init, { dsn: DSN })).toBe(true);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0]?.[0]).toMatchObject({ dsn: DSN });
  });
});
