import { getAuditEvent } from "../../../../services/admin-audit-log.service";
import { uuidParam } from "../../../../utils/admin-handlers";
import { requirePermission } from "../../../../utils/require-auth";

// One event in full (its stored, already redacted change summary and request id).
export default defineEventHandler(async (event) => {
  await requirePermission(event, "view-audit-log");
  return getAuditEvent({ db: useDb() }, uuidParam(event));
});
