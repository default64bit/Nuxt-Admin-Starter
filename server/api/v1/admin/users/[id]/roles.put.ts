import { userRolesSchema } from "../../../../../../shared/schemas/admin-users";
import { setUserRoles } from "../../../../../services/admin-users.service";
import { uuidParam } from "../../../../../utils/admin-handlers";
import { parseBody } from "../../../../../utils/parse-body";
import { requireAllPermissions } from "../../../../../utils/require-auth";

// Replaces the whole set of Roles a User holds (at least one): editing a User and managing Roles together.
export default defineEventHandler(async (event) => {
  const actor = await requireAllPermissions(event, ["edit-users", "manage-roles"]);
  const id = uuidParam(event);
  return setUserRoles({ db: useDb() }, actor, id, await parseBody(event, userRolesSchema));
});
