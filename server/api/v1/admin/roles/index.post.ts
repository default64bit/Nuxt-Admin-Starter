import { roleCreateSchema } from "../../../../../shared/schemas/admin-roles";
import { createRole } from "../../../../services/admin-roles.service";
import { parseBody } from "../../../../utils/parse-body";
import { requirePermission } from "../../../../utils/require-auth";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "manage-roles");
  const input = await parseBody(event, roleCreateSchema);
  const created = await createRole({ db: useDb() }, actor, input);
  setResponseStatus(event, 201);
  return created;
});
