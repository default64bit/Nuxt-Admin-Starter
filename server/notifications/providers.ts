import { createKavenegarProvider, type KavenegarSettings } from "./kavenegar";

// The `SmsProvider` seam (ADR-0010). It serves the one-time sign-in code and nothing else: no other SMS is sent
// by the Starter, and admin SMS stays a reserved Channel key with no adapter. A Project that needs more SMS
// widens this contract deliberately.

/** The two Starter locales; they pick the provider template slot. */
export type SmsLocale = "fa" | "en";

/** Result of one delivery attempt. `category` is the only failure detail ever kept: never provider messages, recipients or credentials. */
export type DeliveryResult = { ok: true } | { ok: false; permanent: boolean; category: string };

export interface OtpSms {
  locale: SmsLocale;
  /** Canonical `+989XXXXXXXXX`. */
  recipient: string;
  /** The five-digit code. Adapters never log it. */
  code: string;
}

/** Stable provider-agnostic contract; the vendor is chosen by configuration. */
export interface SmsProvider {
  sendOtp(message: OtpSms): Promise<DeliveryResult>;
}

const notConfigured = (): DeliveryResult => ({ ok: false, permanent: true, category: "channel_not_configured" });

export const disabledSmsProvider: SmsProvider = { sendOtp: async () => notConfigured() };

/** The dev adapter (`mock`): the local and test default. Accepts every message and logs only the locale, never the recipient or code. */
export function createMockSmsProvider(log: (line: Record<string, unknown>) => void): SmsProvider {
  return {
    sendOtp: async (message) => {
      log({ event: "mock_sms_accepted", locale: message.locale });
      return { ok: true };
    },
  };
}

/**
 * The adapter name actually in effect. An unset or blank `NUXT_SMS_PROVIDER` means the dev adapter (`mock`) in
 * `local` and `test`, and `disabled` everywhere else; an explicit value always wins. This is the one place the
 * default is decided.
 */
export function effectiveSmsProvider(name: string | undefined, appEnv: string | undefined): string {
  const selected = (name ?? "").trim();
  if (selected) return selected;
  return appEnv === "local" || appEnv === "test" ? "mock" : "disabled";
}

/** A one-line startup hint (no secrets) when local or test would silently fail to send codes. */
export function smsStartupWarning(effective: string, appEnv: string | undefined): string | null {
  if (effective === "disabled" && (appEnv === "local" || appEnv === "test")) {
    return "SMS provider is disabled: sign-in cannot send codes. Set NUXT_SMS_PROVIDER=mock (the dev adapter) in .env.";
  }
  return null;
}

/** `NUXT_SMS_ALLOW_MOCK_IN_PRODUCTION`: an explicit, temporary opt-in to run the mock adapter in production. Only the literal `true` turns it on. */
export function allowMockSmsInProduction(value: unknown): boolean {
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

/** The loud startup line for the opt-in: nobody can sign in, because mock sends nothing and never returns the code in production. */
export const MOCK_SMS_PRODUCTION_WARNING =
  "NUXT_SMS_ALLOW_MOCK_IN_PRODUCTION is on: the mock SMS adapter is active in production. No SMS is delivered, so nobody can sign in. Configure kavenegar and remove the flag.";

export interface SmsProviderOptions {
  /** Required to select `kavenegar`; read from the runtime config. */
  kavenegar?: KavenegarSettings;
  /** Lets an explicit `mock` run in production; `disabled` and a blank setting stay refused. */
  allowMockInProduction?: boolean;
  /** Injected for tests. */
  fetch?: typeof fetch;
}

export function resolveSmsProvider(
  name: string | undefined,
  appEnv: string | undefined,
  log: (line: Record<string, unknown>) => void,
  options: SmsProviderOptions = {},
): SmsProvider {
  const selected = effectiveSmsProvider(name, appEnv);
  const mockOptIn = selected === "mock" && options.allowMockInProduction === true;
  if (appEnv === "production" && (selected === "disabled" || selected === "mock") && !mockOptIn) {
    throw new Error("A real SMS provider must be configured in production; disabled and mock adapters are not allowed.");
  }
  if (selected === "disabled") return disabledSmsProvider;
  if (selected === "mock") return createMockSmsProvider(log);
  if (selected === "kavenegar") {
    if (!options.kavenegar) throw new Error("NUXT_SMS_PROVIDER=kavenegar needs the Kavenegar settings.");
    return createKavenegarProvider(options.kavenegar, { log, fetch: options.fetch });
  }
  throw new Error(`Unknown NUXT_SMS_PROVIDER "${selected}". Supported: kavenegar (production), mock (local and test), disabled.`);
}
