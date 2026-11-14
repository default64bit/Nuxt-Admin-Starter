import { inboxListQuerySchema } from "../../../../../shared/schemas/admin-notifications";
import { listInbox } from "../../../../services/admin-inbox.service";
import { parseQuery } from "../../../../utils/parse-query";
import { requireSignedIn } from "../../../../utils/require-auth";

// The User's own Inbox; no page key. Only items they currently hold the Permission for (and are the recipient of, when named).
export default defineEventHandler(async (event) => {
  const actor = await requireSignedIn(event);
  return listInbox({ db: useDb() }, actor, parseQuery(event, inboxListQuerySchema));
});
