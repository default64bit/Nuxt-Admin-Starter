import { purgeSignInData } from "../services/sign-in-cleanup.service";
import { smsStartupWarnings } from "../utils/sms";
import { writeLog } from "../utils/logger";

const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000;

// Sign-in startup: reports an SMS configuration that cannot send codes (no secrets in the lines), then keeps the
// sign-in tables tidy once an hour: expired codes are cleared, send events and ended sessions older than a day go.
export default defineNitroPlugin(() => {
  for (const line of smsStartupWarnings(useRuntimeConfig())) writeLog("warn", line);

  const timer = setInterval(() => {
    purgeSignInData({ db: useDb(), now: () => new Date() }).catch((error: unknown) => {
      writeLog("error", "sign-in housekeeping failed", { error: error instanceof Error ? error.message : "unknown" });
    });
  }, HOUSEKEEPING_INTERVAL_MS);
  timer.unref();
});
