import { chartStyleBodySchema } from "../../../../../../shared/schemas/admin-dashboard";
import { saveChartStyle } from "../../../../../services/admin-dashboard.service";
import { parseBody } from "../../../../../utils/parse-body";
import { requireSignedIn } from "../../../../../utils/require-auth";

// Saves the Chart style at once (last write wins). It touches the caller's own preferences row only.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  const { chartStyle } = await parseBody(event, chartStyleBodySchema);
  return saveChartStyle({ db: useDb() }, actor, chartStyle);
});
