import { adminAuditListQuerySchema } from "../../../../../shared/schemas/admin-audit-log";
import { listAuditLog } from "../../../../services/admin-audit-log.service";
import { parseQuery } from "../../../../utils/parse-query";
import { requirePermission } from "../../../../utils/require-auth";

// The audit feed, newest first, 20 per page with a cursor. Read-only: viewing the log writes no audit event.
export default defineEventHandler(async (event) => {
  await requirePermission(event, "view-audit-log");
  return listAuditLog({ db: useDb() }, parseQuery(event, adminAuditListQuerySchema));
});
