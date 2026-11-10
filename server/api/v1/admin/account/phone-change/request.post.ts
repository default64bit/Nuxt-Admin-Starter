import { randomInt } from "node:crypto";
import { phoneChangeRequestSchema } from "../../../../../../shared/schemas/phone-change";
import { requestPhoneChange } from "../../../../../services/phone-change.service";
import { exposeTestCode } from "../../../../../utils/auth-config";
import { serviceUnavailable } from "../../../../../utils/domain-errors";
import { hashIp } from "../../../../../utils/ip-hash";
import { requestLogger } from "../../../../../utils/logger";
import { parseBody } from "../../../../../utils/parse-body";
import { requireSignedIn } from "../../../../../utils/require-auth";
import { useSmsProvider } from "../../../../../utils/sms";

// Sends a code to the new number. 401 before anything is read; never logs the body, the number or the code.
export default defineEventHandler(async (event) => {
  const { userId } = await requireSignedIn(event);
  const body = await parseBody(event, phoneChangeRequestSchema);

  const config = useRuntimeConfig(event);
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  const log = requestLogger(event);

  let sms;
  try {
    sms = useSmsProvider();
  } catch (error) {
    // A provider that is not usable here (production without a real adapter) is a delivery failure, not a crash.
    log.error("phone_change_request", { outcome: "sms_not_configured", error: error instanceof Error ? error.message : "unknown" });
    throw serviceUnavailable("sms_unavailable");
  }

  try {
    const result = await requestPhoneChange(
      { userId, phone: body.phone, locale: body.locale, ipHash: hashIp(ip, config.ipHashSecret) },
      { db: useDb(), sms, now: () => new Date(), randomInt: (max) => randomInt(max), exposeTestCode: exposeTestCode(config.appEnv, config.sms.provider) },
    );
    log.info("phone_change_request", { outcome: "sent" });
    return result;
  } catch (error) {
    log.info("phone_change_request", { outcome: (error as { data?: { code?: string } }).data?.code ?? "internal_error" });
    throw error;
  }
});
