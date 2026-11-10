import { getNavCounts } from "../../../services/admin-nav-counts.service";
import { requireSignedIn } from "../../../utils/require-auth";

// The bell's count and the menu's queue counts, never part of the session read. Any signed-in User may ask: they always
// get `inboxUnread`, and a queue count only for a Permission they hold.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  return getNavCounts({ db: useDb() }, actor);
});
