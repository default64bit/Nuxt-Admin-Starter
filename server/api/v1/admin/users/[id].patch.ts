import { userNamesSchema } from "../../../../../shared/schemas/admin-users";
import { updateUserNames } from "../../../../services/admin-users.service";
import { uuidParam } from "../../../../utils/admin-handlers";
import { parseBody } from "../../../../utils/parse-body";
import { requirePermission } from "../../../../utils/require-auth";

// Edits both names with the version the User was loaded at (`409 stale_version` otherwise). The phone is not editable here.
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "edit-users");
  const id = uuidParam(event);
  return updateUserNames({ db: useDb() }, actor, id, await parseBody(event, userNamesSchema));
});
