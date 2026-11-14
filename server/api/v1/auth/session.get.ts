import { toSessionPayload } from "../../../services/session.service";
import { resolveAuthSession } from "../../../utils/auth-session";

// Always 200: a guest, expired, revoked or disabled session is `{ loggedIn: false }`, never 401.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  return toSessionPayload(await resolveAuthSession(event));
});
