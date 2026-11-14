import { getAdminChannels } from "../../../../../notifications/admin-channels";
import { listPushDevices } from "../../../../../services/push-subscriptions.service";
import { requireSignedIn } from "../../../../../utils/require-auth";

// The User's own browser push devices (label, language, dates); never the endpoint or keys. Own rows only.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  return listPushDevices({ db: useDb(), channels: getAdminChannels() }, actor.userId);
});
