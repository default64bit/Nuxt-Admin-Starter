import { userStatusBodySchema } from "../../../../../../shared/schemas/admin-users";
import { disableUser } from "../../../../../services/admin-users.service";
import { uuidParam } from "../../../../../utils/admin-handlers";
import { parseBody } from "../../../../../utils/parse-body";
import { requirePermission } from "../../../../../utils/require-auth";

// Offboards a User: disabled, every session revoked. Never oneself, never the Default admin.
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "disable-users");
  const id = uuidParam(event);
  return disableUser({ db: useDb() }, actor, id, await parseBody(event, userStatusBodySchema));
});
