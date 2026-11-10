import { setInboxRead } from "../../../../../services/admin-inbox.service";
import { uuidParam } from "../../../../../utils/admin-handlers";
import { requireSignedIn } from "../../../../../utils/require-auth";

export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  return setInboxRead({ db: useDb() }, actor, uuidParam(event), true);
});
