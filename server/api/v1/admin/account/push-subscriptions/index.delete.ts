import { setResponseStatus } from "h3";
import { pushUnsubscribeSchema } from "../../../../../../shared/schemas/admin-push-subscriptions";
import { getAdminChannels } from "../../../../../notifications/admin-channels";
import { removePushDevice } from "../../../../../services/push-subscriptions.service";
import { parseBody } from "../../../../../utils/parse-body";
import { requireSignedIn } from "../../../../../utils/require-auth";

// Removes this browser's own subscription by endpoint (in the body, so the capability URL is never in a URL).
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  const body = await parseBody(event, pushUnsubscribeSchema);
  await removePushDevice({ db: useDb(), channels: getAdminChannels() }, actor.userId, { endpoint: body.endpoint });
  setResponseStatus(event, 204);
  return null;
});
