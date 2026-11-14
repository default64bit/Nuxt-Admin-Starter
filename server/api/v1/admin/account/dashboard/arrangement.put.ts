import { arrangementBodySchema } from "../../../../../../shared/schemas/admin-dashboard";
import { saveDashboardArrangement } from "../../../../../services/admin-dashboard.service";
import { parseBody } from "../../../../../utils/parse-body";
import { requireSignedIn } from "../../../../../utils/require-auth";

// Saves the Customize draft strictly: 422 `invalid_layout`, or 409 `stale_layout` when another device saved first.
// It touches the caller's own preferences row only, and never the ranges or the Chart style.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  const body = await parseBody(event, arrangementBodySchema);
  return saveDashboardArrangement({ db: useDb() }, actor, body);
});
