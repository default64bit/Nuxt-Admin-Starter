import { roleListQuerySchema } from "../../../../../shared/schemas/admin-roles";
import { listAdminRoles } from "../../../../services/admin-roles.service";
import { parseQuery } from "../../../../utils/parse-query";
import { requirePermission } from "../../../../utils/require-auth";

export default defineEventHandler(async (event) => {
  await requirePermission(event, "view-roles");
  return listAdminRoles({ db: useDb() }, parseQuery(event, roleListQuerySchema));
});
