import { moduleRangeBodySchema } from "../../../../../../../shared/schemas/admin-dashboard";
import { saveModuleRange } from "../../../../../../services/admin-dashboard.service";
import { parseBody } from "../../../../../../utils/parse-body";
import { requireSignedIn } from "../../../../../../utils/require-auth";

// Saves one module's range at once, also for a module that is only in an unsaved Customize draft. It touches the
// caller's own preferences row and never the arrangement or its version.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  const { range } = await parseBody(event, moduleRangeBodySchema);
  return saveModuleRange({ db: useDb() }, actor, getRouterParam(event, "moduleKey") ?? "", range);
});
