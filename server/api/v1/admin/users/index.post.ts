import { userCreateSchema } from "../../../../../shared/schemas/admin-users";
import { createUser } from "../../../../services/admin-users.service";
import { parseBody } from "../../../../utils/parse-body";
import { requireAllPermissions } from "../../../../utils/require-auth";

// Creating a User gives them Roles, so it needs `create-users` and `manage-roles` together.
export default defineEventHandler(async (event) => {
  const actor = await requireAllPermissions(event, ["create-users", "manage-roles"]);
  const input = await parseBody(event, userCreateSchema);
  const created = await createUser({ db: useDb() }, actor, input);
  setResponseStatus(event, 201);
  return created;
});
