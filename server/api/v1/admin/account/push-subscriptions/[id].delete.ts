import { setResponseStatus } from "h3";
import { getAdminChannels } from "../../../../../notifications/admin-channels";
import { removePushDevice } from "../../../../../services/push-subscriptions.service";
import { uuidParam } from "../../../../../utils/admin-handlers";
import { requireSignedIn } from "../../../../../utils/require-auth";

// Removes one of the caller's own devices; another User's id is a 404.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  await removePushDevice({ db: useDb(), channels: getAdminChannels() }, actor.userId, { id: uuidParam(event) });
  setResponseStatus(event, 204);
  return null;
});
