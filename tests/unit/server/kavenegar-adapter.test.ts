// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createKavenegarProvider, kavenegarSettingsFromConfig, parseKavenegarTimeout, type KavenegarSettings } from "../../../server/notifications/kavenegar";
import { kavenegarAccepted, kavenegarError, type RecordedResponse } from "../../fixtures/kavenegar-responses";

// The Kavenegar adapter against recorded responses. No test here touches the network.

const API_KEY = "kv-secret-API-key-0123456789";
const RECIPIENT = "+989121234567";

const settings = (overrides: Partial<KavenegarSettings> = {}): KavenegarSettings => ({
  apiKey: API_KEY,
  timeoutMs: 10_000,
  otpTemplates: { fa: "otpFa", en: "otpEn" },
  ...overrides,
});

function setup(respond: RecordedResponse, overrides: Partial<KavenegarSettings> = {}) {
  const calls: { url: string; form: URLSearchParams }[] = [];
  const logs: Record<string, unknown>[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), form: new URLSearchParams(String(init?.body)) });
    return new Response(respond.body, { status: respond.status });
  }) as unknown as typeof fetch;
  return { provider: createKavenegarProvider(settings(overrides), { fetch: fetchImpl, log: (line) => logs.push(line) }), calls, logs };
}

describe("the Kavenegar adapter (OTP template slots only)", () => {
  it("posts a form-encoded verify/lookup call with the locale's template and the code as the one token", async () => {
    const { provider, calls } = setup(kavenegarAccepted);
    expect(await provider.sendOtp({ locale: "en", recipient: RECIPIENT, code: "04821" })).toEqual({ ok: true });
    expect(calls[0]!.url).toBe(`https://api.kavenegar.com/v1/${API_KEY}/verify/lookup.json`);
    expect(Object.fromEntries(calls[0]!.form)).toEqual({ receptor: "09121234567", template: "otpEn", token: "04821" });
  });

  it("falls back to the Persian template when the English slot is empty", async () => {
    const { provider, calls } = setup(kavenegarAccepted, { otpTemplates: { fa: "otpFa", en: "" } });
    await provider.sendOtp({ locale: "en", recipient: RECIPIENT, code: "11111" });
    expect(calls[0]!.form.get("template")).toBe("otpFa");
  });

  it("fails without calling Kavenegar for a bad recipient or a missing template", async () => {
    const { provider, calls } = setup(kavenegarAccepted, { otpTemplates: {} });
    expect(await provider.sendOtp({ locale: "fa", recipient: "09121234567", code: "11111" })).toEqual({ ok: false, permanent: true, category: "invalid_recipient" });
    expect(await provider.sendOtp({ locale: "fa", recipient: RECIPIENT, code: "11111" })).toEqual({ ok: false, permanent: true, category: "template_missing" });
    expect(calls).toHaveLength(0);
  });

  it("reports only a category on failure, logs account errors without the key or provider text, and never leaks the key", async () => {
    const { provider, logs } = setup(kavenegarError(401));
    const result = await provider.sendOtp({ locale: "fa", recipient: RECIPIENT, code: "11111" });
    expect(result).toEqual({ ok: false, permanent: true, category: "kavenegar_401" });
    expect(logs).toEqual([{ level: "error", event: "sms_provider_account_error", provider: "kavenegar", category: "kavenegar_401" }]);
    expect(JSON.stringify([result, logs])).not.toContain(API_KEY);
    expect(JSON.stringify([result, logs])).not.toContain("11111");
  });

  it("does not count a 200 HTTP answer whose return.status says otherwise as accepted", async () => {
    const { provider } = setup({ status: 200, body: JSON.stringify({ return: { status: 418, message: "x" } }) });
    expect(await provider.sendOtp({ locale: "fa", recipient: RECIPIENT, code: "11111" })).toMatchObject({ ok: false, category: "kavenegar_418" });
  });

  it("refuses to start without an API key", () => {
    expect(() => createKavenegarProvider(settings({ apiKey: " " }))).toThrow(/API key/);
  });

  it("reads settings from the runtime config and bounds the timeout", () => {
    const fromConfig = kavenegarSettingsFromConfig({ kavenegar: { apiKey: " key ", timeoutMs: "500" }, sms: { template: { otp: { fa: "a", en: "b" } } } });
    expect(fromConfig).toEqual({ apiKey: "key", timeoutMs: 10_000, otpTemplates: { fa: "a", en: "b" } });
    expect([parseKavenegarTimeout("1000"), parseKavenegarTimeout(60_000), parseKavenegarTimeout(999), parseKavenegarTimeout("x")]).toEqual([1000, 60_000, null, null]);
  });
});
