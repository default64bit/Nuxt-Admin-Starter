// demo-ticket:start (whole file)
import { deleteDemoTicket } from "../../../../services/demo-ticket.service";
import { uuidParam } from "../../../../utils/admin-handlers";
import { requirePermission } from "../../../../utils/require-auth";

// Deletes a ticket for good; the page asks for a confirmation first.
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "manage-demo-tickets");
  await deleteDemoTicket({ db: useDb() }, actor, uuidParam(event));
  setResponseStatus(event, 204);
  return null;
});
// demo-ticket:end
