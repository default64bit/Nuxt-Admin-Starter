import { userStatusBodySchema } from "../../../../../../shared/schemas/admin-users";
import { enableUser } from "../../../../../services/admin-users.service";
import { uuidParam } from "../../../../../utils/admin-handlers";
import { parseBody } from "../../../../../utils/parse-body";
import { requirePermission } from "../../../../../utils/require-auth";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "disable-users");
  const id = uuidParam(event);
  return enableUser({ db: useDb() }, actor, id, await parseBody(event, userStatusBodySchema));
});
