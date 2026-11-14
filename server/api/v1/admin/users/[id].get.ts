import { getAdminUserPage } from "../../../../services/admin-users.service";
import { uuidParam } from "../../../../utils/admin-handlers";
import { requirePermission } from "../../../../utils/require-auth";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "view-users");
  return getAdminUserPage({ db: useDb() }, actor, uuidParam(event));
});
