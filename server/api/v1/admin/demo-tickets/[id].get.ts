// demo-ticket:start (whole file)
import { getDemoTicket } from "../../../../services/demo-ticket.service";
import { uuidParam } from "../../../../utils/admin-handlers";
import { requirePermission } from "../../../../utils/require-auth";

// One ticket, so a `?ticket=<id>` link can open its dialog whatever page of the list it is on.
export default defineEventHandler(async (event) => {
  await requirePermission(event, "view-demo-tickets");
  return getDemoTicket({ db: useDb() }, uuidParam(event));
});
// demo-ticket:end
