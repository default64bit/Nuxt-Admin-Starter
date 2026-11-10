import { loadUsersStrip } from "../../../../../services/admin-users-strip.service";
import { requirePermission } from "../../../../../utils/require-auth";

// The Users list's Analytics strip: gated by the Users page's own Permission.
export default defineEventHandler(async (event) => {
  await requirePermission(event, "view-users");
  return loadUsersStrip({ db: useDb() });
});
