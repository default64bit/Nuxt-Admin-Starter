import { listRoleOptions } from "../../../../services/admin-roles.service";
import { requireAnyPermission } from "../../../../utils/require-auth";

// Read-only lookup of every Role for pickers and the Users list's Role filter: open to the User and Role viewers.
export default defineEventHandler(async (event) => {
  const actor = await requireAnyPermission(event, ["view-users", "view-roles"]);
  return listRoleOptions({ db: useDb() }, actor.isSuper);
});
