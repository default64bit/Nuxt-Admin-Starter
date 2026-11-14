import { roleDeleteQuerySchema } from "../../../../../shared/schemas/admin-roles";
import { deleteRole } from "../../../../services/admin-roles.service";
import { uuidParam } from "../../../../utils/admin-handlers";
import { parseQuery } from "../../../../utils/parse-query";
import { requirePermission } from "../../../../utils/require-auth";

// Deletes a Role no account holds; the version it was loaded at is the `expectedUpdatedAt` query parameter.
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "manage-roles");
  const id = uuidParam(event);
  const { expectedUpdatedAt } = parseQuery(event, roleDeleteQuerySchema);
  await deleteRole({ db: useDb() }, actor, id, expectedUpdatedAt);
  setResponseStatus(event, 204);
  return null;
});
