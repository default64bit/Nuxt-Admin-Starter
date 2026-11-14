import { resetDashboardArrangement } from "../../../../../services/admin-dashboard.service";
import { requireSignedIn } from "../../../../../utils/require-auth";

// Saves a Reset draft that was left unchanged: the arrangement becomes null (the computed default). Ranges and the
// Chart style are kept. 409 `stale_layout` when another device saved first.
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  const { expectedUpdatedAt } = getQuery(event); // absent means the User never saved; anything but a string is refused by the service
  return resetDashboardArrangement({ db: useDb() }, actor, expectedUpdatedAt ?? null);
});
