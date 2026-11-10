// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { allowMockSmsInProduction, effectiveSmsProvider, resolveSmsProvider, smsStartupWarning } from "../../../server/notifications/providers";
import { exposeTestCode } from "../../../server/utils/auth-config";

const otp = { locale: "en", recipient: "+989120000000", code: "01234" } as const;

describe("effectiveSmsProvider (the mock adapter is the local and test default)", () => {
  it.each([undefined, "", "   "])("defaults to mock in local and test when the setting is %j", (value) => {
    expect(effectiveSmsProvider(value, "local")).toBe("mock");
    expect(effectiveSmsProvider(value, "test")).toBe("mock");
  });

  it.each([undefined, ""])("defaults to disabled in staging and production when the setting is %j", (value) => {
    expect(effectiveSmsProvider(value, "staging")).toBe("disabled");
    expect(effectiveSmsProvider(value, "production")).toBe("disabled");
  });

  it("honours an explicit value everywhere, including disabled in local", () => {
    expect(effectiveSmsProvider("disabled", "local")).toBe("disabled");
    expect(effectiveSmsProvider(" mock ", "staging")).toBe("mock");
  });
});

describe("the default drives the adapter and the test code together", () => {
  it("resolves the mock adapter, which logs only the locale, and exposes the test code in local with nothing configured", async () => {
    const log = vi.fn();
    const provider = resolveSmsProvider(undefined, "local", log);
    expect(await provider.sendOtp(otp)).toEqual({ ok: true });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/01234|989120000000/);
    expect(exposeTestCode("local", effectiveSmsProvider(undefined, "local"))).toBe(true);
  });

  it("never exposes a test code outside local and test, whatever is configured", () => {
    for (const env of ["staging", "production", undefined]) {
      for (const setting of [undefined, "", "mock", "disabled"]) {
        expect(exposeTestCode(env, effectiveSmsProvider(setting, env)), `${env}/${setting}`).toBe(false);
      }
    }
  });

  it("refuses mock and disabled in production unless the explicit mock opt-in is on, and never lets the opt-in enable disabled", () => {
    for (const setting of [undefined, "", "mock", "disabled"]) {
      expect(() => resolveSmsProvider(setting, "production", () => {})).toThrow(/production/);
    }
    expect(() => resolveSmsProvider("mock", "production", () => {}, { allowMockInProduction: true })).not.toThrow();
    for (const setting of [undefined, "", "disabled"]) {
      expect(() => resolveSmsProvider(setting, "production", () => {}, { allowMockInProduction: true })).toThrow(/production/);
    }
  });

  it("selects the disabled adapter, which delivers nothing, and rejects unknown names", async () => {
    expect(await resolveSmsProvider("disabled", "local", () => {}).sendOtp(otp)).toMatchObject({ ok: false, category: "channel_not_configured" });
    expect(() => resolveSmsProvider("carrier-pigeon", "local", () => {})).toThrow(/Unknown/);
    expect(() => resolveSmsProvider("kavenegar", "local", () => {})).toThrow(/settings/);
  });
});

describe("startup lines", () => {
  it("reads only a literal true as the production opt-in", () => {
    expect([true, "true", " True "].map(allowMockSmsInProduction)).toEqual([true, true, true]);
    expect([false, "", "false", "yes", "1", undefined, null, 1].map(allowMockSmsInProduction)).toEqual(Array(8).fill(false));
  });

  it("warns, pointing at the mock adapter, only when local or test resolves to disabled, and never names secrets", () => {
    expect(smsStartupWarning("disabled", "local")).toMatch(/NUXT_SMS_PROVIDER=mock/);
    expect(smsStartupWarning("mock", "local")).toBeNull();
    expect(smsStartupWarning("disabled", "production")).toBeNull();
    expect(smsStartupWarning("disabled", "local")).not.toMatch(/\+98|09\d{9}|token|secret/i);
  });
});
