import { getAdminChannels } from "../../../../../../notifications/admin-channels";
import { sendPushTest } from "../../../../../../services/push-subscriptions.service";
import { uuidParam } from "../../../../../../utils/admin-handlers";
import { requireSignedIn } from "../../../../../../utils/require-auth";

// A test push to one of the caller's own devices: `{ result: "sent" | "rejected" | "unavailable" }`; 429 within 30 s.
// It sends to this browser only and writes no Inbox item, outbox row or audit.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  return sendPushTest({ db: useDb(), channels: getAdminChannels() }, actor.userId, uuidParam(event));
});
