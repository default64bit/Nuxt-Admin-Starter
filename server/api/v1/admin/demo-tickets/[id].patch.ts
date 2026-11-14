// demo-ticket:start (whole file)
import { demoTicketUpdateSchema } from "../../../../../shared/schemas/demo-ticket";
import { updateDemoTicket } from "../../../../services/demo-ticket.service";
import { uuidParam } from "../../../../utils/admin-handlers";
import { tryObjectStorage } from "../../../../utils/object-storage";
import { parseBody } from "../../../../utils/parse-body";
import { requirePermission } from "../../../../utils/require-auth";

// Saves a ticket with the version it was loaded at (`409 stale_version` otherwise); a status change is one step forward.
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "manage-demo-tickets");
  const id = uuidParam(event);
  return updateDemoTicket({ db: useDb(), storage: tryObjectStorage() }, actor, id, await parseBody(event, demoTicketUpdateSchema));
});
// demo-ticket:end
