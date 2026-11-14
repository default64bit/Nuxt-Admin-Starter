import { getRequestHeader, setResponseStatus } from "h3";
import { pushSubscribeSchema } from "../../../../../../shared/schemas/admin-push-subscriptions";
import { getAdminChannels } from "../../../../../notifications/admin-channels";
import { subscribePush } from "../../../../../services/push-subscriptions.service";
import { parseBody } from "../../../../../utils/parse-body";
import { requireSignedIn } from "../../../../../utils/require-auth";

// Subscribes this browser (a personal preference, not audited). The user agent only yields the device label; it is not stored.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  const body = await parseBody(event, pushSubscribeSchema);
  const device = await subscribePush({ db: useDb(), channels: getAdminChannels() }, actor.userId, { ...body, userAgent: getRequestHeader(event, "user-agent") });
  setResponseStatus(event, 201);
  return device;
});
