import { notificationSettingsSaveSchema } from "../../../../../shared/schemas/admin-notification-settings";
import { saveNotificationSettings } from "../../../../services/admin-notification-settings.service";
import { parseBody } from "../../../../utils/parse-body";
import { requireSignedIn } from "../../../../utils/require-auth";

// A personal preference: touches only the caller's own rows and is not audited.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  const body = await parseBody(event, notificationSettingsSaveSchema);
  return saveNotificationSettings({ db: useDb() }, actor.userId, body);
});
