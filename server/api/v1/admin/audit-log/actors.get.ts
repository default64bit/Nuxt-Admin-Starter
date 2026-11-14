import { listAuditActorOptions } from "../../../../services/admin-audit-log.service";
import { requirePermission } from "../../../../utils/require-auth";

// The Actor select's options: Users with at least one event.
export default defineEventHandler(async (event) => {
  await requirePermission(event, "view-audit-log");
  return listAuditActorOptions({ db: useDb() });
});
