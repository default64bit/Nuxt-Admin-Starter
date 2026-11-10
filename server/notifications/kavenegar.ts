import type { DeliveryResult, OtpSms, SmsLocale, SmsProvider } from "./providers";

// The Kavenegar adapter behind the `SmsProvider` seam. It sends the sign-in code with a `verify/lookup` template
// (plain `fetch`, no SDK) and needs exactly two template slots: the OTP template for `fa` and for `en`
// (`NUXT_SMS_TEMPLATE_OTP_FA` / `NUXT_SMS_TEMPLATE_OTP_EN`). The API key sits in the request URL path, so the URL
// exists only inside `sendOtp`: it is never logged, returned, or attached to an error. Every failure leaves this
// file as a short category plus a permanent flag, never as provider text. A code is never retried (the person
// resends), so every failure is final for that attempt.

export const KAVENEGAR_HOST = "https://api.kavenegar.com";
export const DEFAULT_KAVENEGAR_TIMEOUT_MS = 10_000;
export const KAVENEGAR_TIMEOUT_RANGE_MS = { min: 1_000, max: 60_000 } as const;

/** Owner-fixable account-level codes (credentials, allowlist, plan): logged at error level with the category only. */
const ACCOUNT_CODES = new Set([401, 403, 407, 416, 418, 424, 426, 427, 429, 501]);

/** The OTP template per locale: the only template slots the Starter has. */
export type KavenegarOtpTemplates = Partial<Record<SmsLocale, string | undefined>>;

export interface KavenegarSettings {
  apiKey: string;
  timeoutMs: number;
  otpTemplates: KavenegarOtpTemplates;
}

/** The timeout in milliseconds, or null when it is not a whole number inside the allowed range. */
export function parseKavenegarTimeout(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= KAVENEGAR_TIMEOUT_RANGE_MS.min && parsed <= KAVENEGAR_TIMEOUT_RANGE_MS.max ? parsed : null;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Settings from the Nuxt runtime config. Never throws. */
export function kavenegarSettingsFromConfig(
  config: { kavenegar?: { apiKey?: unknown; timeoutMs?: unknown }; sms?: { template?: { otp?: KavenegarOtpTemplates } } } | undefined,
): KavenegarSettings {
  const raw = config?.kavenegar;
  return {
    apiKey: text(raw?.apiKey),
    timeoutMs: raw?.timeoutMs === undefined || raw.timeoutMs === "" ? DEFAULT_KAVENEGAR_TIMEOUT_MS : (parseKavenegarTimeout(raw.timeoutMs) ?? DEFAULT_KAVENEGAR_TIMEOUT_MS),
    otpTemplates: config?.sms?.template?.otp ?? {},
  };
}

/** A startup warning when the English slot is empty: English requests are then sent with the Persian template. */
export function emptyEnglishSlotWarning(templates: KavenegarOtpTemplates): string | null {
  return text(templates.en) ? null : "NUXT_SMS_TEMPLATE_OTP_EN is empty: English sign-in codes are sent with the Persian template (NUXT_SMS_TEMPLATE_OTP_FA).";
}

/** `+989121234567` to the local `09121234567` Kavenegar takes; anything else is not sent. */
function receptorOf(recipient: string): string | null {
  const match = /^\+989(\d{9})$/.exec(recipient);
  return match ? `09${match[1]}` : null;
}

const isAbort = (error: unknown): boolean => error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

export function createKavenegarProvider(settings: KavenegarSettings, deps: { fetch?: typeof fetch; log?: (line: Record<string, unknown>) => void } = {}): SmsProvider {
  const apiKey = settings.apiKey.trim();
  if (!apiKey) throw new Error("The Kavenegar API key is not configured.");
  const doFetch = deps.fetch ?? globalThis.fetch;
  const log = deps.log ?? (() => {});

  return {
    async sendOtp(message: OtpSms): Promise<DeliveryResult> {
      const fail = (category: string): DeliveryResult => ({ ok: false, permanent: true, category });

      const receptor = receptorOf(message.recipient);
      if (!receptor) return fail("invalid_recipient");
      const template = text(settings.otpTemplates[message.locale]) || text(settings.otpTemplates.fa);
      if (!template) return fail("template_missing");

      const body = new URLSearchParams({ receptor, template, token: message.code });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
      let status: number;
      let answer: unknown;
      try {
        // The URL carries the key; it is built here, used once, and never leaves this scope.
        const response = await doFetch(`${KAVENEGAR_HOST}/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body,
          signal: controller.signal,
        });
        status = response.status;
        const raw = await response.text();
        try {
          answer = JSON.parse(raw);
        } catch {
          answer = null;
        }
      } catch (error) {
        // Network failure or timeout. The error is dropped: its message may carry the request URL.
        return fail(isAbort(error) || controller.signal.aborted ? "timeout" : "network_error");
      } finally {
        clearTimeout(timer);
      }

      const returned = (answer as { return?: { status?: unknown } } | null)?.return?.status;
      const code = typeof returned === "number" ? returned : undefined;
      if (status === 200 && code === 200) return { ok: true };

      // The code Kavenegar reports wins; without one, the HTTP status classifies the failure.
      const effective = code ?? status;
      if (effective === 200) return fail("unreadable_response");
      const category = `kavenegar_${effective}`;
      if (ACCOUNT_CODES.has(effective)) {
        // The owner can fix these; the line names the category only, so it can reach error tracking.
        log({ level: "error", event: "sms_provider_account_error", provider: "kavenegar", category });
      }
      return fail(category);
    },
  };
}
