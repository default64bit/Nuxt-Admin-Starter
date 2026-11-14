// demo-ticket:start (whole file)
import { listDemoTicketAssignees } from "../../../../services/demo-ticket.service";
import { requirePermission } from "../../../../utils/require-auth";

// The active Users a ticket can be assigned to: for the assignee filter and the dialog's picker.
export default defineEventHandler(async (event) => {
  await requirePermission(event, "view-demo-tickets");
  return listDemoTicketAssignees({ db: useDb() });
});
// demo-ticket:end
