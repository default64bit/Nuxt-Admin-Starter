// demo-ticket:start (whole file)
import { demoTicketCreateSchema } from "../../../../../shared/schemas/demo-ticket";
import { createDemoTicket } from "../../../../services/demo-ticket.service";
import { tryObjectStorage } from "../../../../utils/object-storage";
import { parseBody } from "../../../../utils/parse-body";
import { requirePermission } from "../../../../utils/require-auth";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "manage-demo-tickets");
  const created = await createDemoTicket({ db: useDb(), storage: tryObjectStorage() }, actor, await parseBody(event, demoTicketCreateSchema));
  setResponseStatus(event, 201);
  return created;
});
// demo-ticket:end
