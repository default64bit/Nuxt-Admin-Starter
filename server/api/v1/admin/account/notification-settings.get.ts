import { getNotificationSettings } from "../../../../services/admin-notification-settings.service";
import { requireSignedIn } from "../../../../utils/require-auth";

// The User's own Channel choices and Message language: no page key, own state only.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  return getNotificationSettings({ db: useDb() }, actor.userId);
});
