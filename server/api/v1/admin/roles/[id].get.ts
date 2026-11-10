import { getAdminRole } from "../../../../services/admin-roles.service";
import { uuidParam } from "../../../../utils/admin-handlers";
import { requirePermission } from "../../../../utils/require-auth";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "view-roles");
  return getAdminRole({ db: useDb() }, uuidParam(event), actor.userId);
});
