import { roleSaveSchema } from "../../../../../shared/schemas/admin-roles";
import { saveRole } from "../../../../services/admin-roles.service";
import { uuidParam } from "../../../../utils/admin-handlers";
import { parseBody } from "../../../../utils/parse-body";
import { requirePermission } from "../../../../utils/require-auth";

// Saves a Role with the version it was loaded at (`409 stale_version` otherwise).
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "manage-roles");
  const id = uuidParam(event);
  const input = await parseBody(event, roleSaveSchema);
  return saveRole({ db: useDb() }, actor, id, input);
});
