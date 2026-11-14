import { getDashboard } from "../../../../services/admin-dashboard.service";
import { requireSignedIn } from "../../../../utils/require-auth";

// The Dashboard has no page Permission: any signed-in User reads their own layout, filtered by what their Roles may
// see. The handler only ever touches the caller's own row; no User id appears in the URL.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  return getDashboard({ db: useDb() }, actor);
});
