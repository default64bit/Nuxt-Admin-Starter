import { loadDashboardModule } from "../../../../../services/admin-dashboard.service";
import { requireSignedIn } from "../../../../../utils/require-auth";

// One Dashboard module's data. A module has no page key, so the service checks the module's own gate Permission from
// the registry on every request (404 for an unknown key, 403 without the Permission) before it reads the cache.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  return loadDashboardModule({ db: useDb() }, actor, getRouterParam(event, "moduleKey") ?? "", getQuery(event).range);
});
