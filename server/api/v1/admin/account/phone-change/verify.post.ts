import { phoneChangeVerifySchema } from "../../../../../../shared/schemas/phone-change";
import { verifyPhoneChange } from "../../../../../services/phone-change.service";
import { requestLogger } from "../../../../../utils/logger";
import { parseBody } from "../../../../../utils/parse-body";
import { requireSignedIn } from "../../../../../utils/require-auth";

// Completes the change with the right code; this session stays signed in, the User's other sessions end.
export default defineEventHandler(async (event) => {
  const { userId, sessionId } = await requireSignedIn(event);
  const body = await parseBody(event, phoneChangeVerifySchema);
  const log = requestLogger(event);

  try {
    const result = await verifyPhoneChange({ userId, sessionId, phone: body.phone, code: body.code }, { db: useDb(), now: () => new Date() });
    log.info("phone_change_verify", { outcome: "changed" });
    return result;
  } catch (error) {
    log.info("phone_change_verify", { outcome: (error as { data?: { code?: string } }).data?.code ?? "internal_error" });
    throw error;
  }
});
