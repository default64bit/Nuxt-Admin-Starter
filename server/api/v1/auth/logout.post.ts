import { logout } from "../../../services/session.service";
import { currentTokenHash } from "../../../utils/auth-session";
import { useDb } from "../../../utils/db";
import { requestLogger } from "../../../utils/logger";

// Always 204, even for a guest. Revokes only this browser's session and clears its cookie.
export default defineEventHandler(async (event) => {
  await logout(await currentTokenHash(event), { db: useDb(), now: () => new Date(), requestId: event.context.requestId as string | undefined });
  await clearUserSession(event);
  requestLogger(event).info("logout", { outcome: "signed_out" });
  setResponseStatus(event, 204);
  setResponseHeader(event, "cache-control", "private, no-store");
  return null;
});
