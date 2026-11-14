import { inboxReadAllBodySchema } from "../../../../../shared/schemas/admin-notifications";
import { markAllInboxRead } from "../../../../services/admin-inbox.service";
import { parseBody } from "../../../../utils/parse-body";
import { requireSignedIn } from "../../../../utils/require-auth";

export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  const body = await parseBody(event, inboxReadAllBodySchema);
  return markAllInboxRead({ db: useDb() }, actor, new Date(body.before));
});
