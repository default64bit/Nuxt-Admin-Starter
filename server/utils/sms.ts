import { emptyEnglishSlotWarning, kavenegarSettingsFromConfig } from "../notifications/kavenegar";
import {
  MOCK_SMS_PRODUCTION_WARNING,
  allowMockSmsInProduction,
  effectiveSmsProvider,
  resolveSmsProvider,
  smsStartupWarning,
  type SmsProvider,
} from "../notifications/providers";
import { writeLog } from "./logger";

let provider: SmsProvider | undefined;

/** The configured SMS adapter, resolved once. Throws in production for the disabled and mock adapters unless the mock opt-in allows it. */
export function useSmsProvider(): SmsProvider {
  if (!provider) {
    const config = useRuntimeConfig();
    provider = resolveSmsProvider(config.sms.provider, config.appEnv, ({ level, ...fields }) => writeLog(level === "error" ? "error" : "info", "sms", fields), {
      kavenegar: kavenegarSettingsFromConfig(config),
      allowMockInProduction: allowMockSmsInProduction(config.sms.allowMockInProduction),
    });
  }
  return provider;
}

/** The startup lines about the SMS configuration (no secrets). Empty when all is well. */
export function smsStartupWarnings(config: ReturnType<typeof useRuntimeConfig>): string[] {
  const effective = effectiveSmsProvider(config.sms.provider, config.appEnv);
  const lines: (string | null)[] = [smsStartupWarning(effective, config.appEnv)];
  if (config.appEnv === "production") {
    if (effective === "mock") lines.push(allowMockSmsInProduction(config.sms.allowMockInProduction) ? MOCK_SMS_PRODUCTION_WARNING : "The mock SMS adapter is not allowed in production; sign-in codes cannot be sent.");
    if (effective === "disabled") lines.push("No SMS provider is configured (NUXT_SMS_PROVIDER); sign-in codes cannot be sent.");
  }
  if (effective === "kavenegar") lines.push(emptyEnglishSlotWarning(kavenegarSettingsFromConfig(config).otpTemplates));
  return lines.filter((line): line is string => Boolean(line));
}
