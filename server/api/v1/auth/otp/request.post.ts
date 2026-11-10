import { randomInt } from "node:crypto";
import { otpRequestSchema } from "../../../../../shared/schemas/auth";
import { requestOtp } from "../../../../services/auth.service";
import { exposeTestCode } from "../../../../utils/auth-config";
import { serviceUnavailable } from "../../../../utils/domain-errors";
import { hashIp } from "../../../../utils/ip-hash";
import { requestLogger } from "../../../../utils/logger";
import { parseBody } from "../../../../utils/parse-body";
import { useSmsProvider } from "../../../../utils/sms";

// Thin route: validate, delegate to the service, translate errors (ADR-0005). Never log the body.
export default defineEventHandler(async (event) => {
  const body = await parseBody(event, otpRequestSchema);

  const config = useRuntimeConfig(event);
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  const log = requestLogger(event);

  let sms;
  try {
    sms = useSmsProvider();
  } catch (error) {
    // A provider that is not usable here (production without a real adapter) is a delivery failure, not a crash.
    log.error("otp_request", { outcome: "sms_not_configured", error: error instanceof Error ? error.message : "unknown" });
    throw serviceUnavailable("sms_unavailable");
  }

  try {
    const result = await requestOtp(
      { phone: body.phone, locale: body.locale, ipHash: hashIp(ip, config.ipHashSecret) },
      { db: useDb(), sms, now: () => new Date(), randomInt: (max) => randomInt(max), exposeTestCode: exposeTestCode(config.appEnv, config.sms.provider) },
    );
    log.info("otp_request", { outcome: "sent" });
    return result;
  } catch (error) {
    const outcome = (error as { data?: { code?: string } }).data?.code ?? "internal_error";
    log.info("otp_request", { outcome });
    throw error;
  }
});
