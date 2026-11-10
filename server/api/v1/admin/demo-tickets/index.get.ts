// demo-ticket:start (whole file)
import { demoTicketListQuerySchema } from "../../../../../shared/schemas/demo-ticket";
import { listDemoTickets } from "../../../../services/demo-ticket.service";
import { parseQuery } from "../../../../utils/parse-query";
import { requirePermission } from "../../../../utils/require-auth";

export default defineEventHandler(async (event) => {
  await requirePermission(event, "view-demo-tickets");
  return listDemoTickets({ db: useDb() }, parseQuery(event, demoTicketListQuerySchema));
});
// demo-ticket:end
