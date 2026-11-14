import { userListQuerySchema } from "../../../../../shared/schemas/admin-users";
import { listAdminUsers } from "../../../../services/admin-users.service";
import { parseQuery } from "../../../../utils/parse-query";
import { requirePermission } from "../../../../utils/require-auth";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "view-users");
  return listAdminUsers({ db: useDb() }, actor.userId, parseQuery(event, userListQuerySchema));
});
