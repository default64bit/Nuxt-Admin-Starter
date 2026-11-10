import { getAccount } from "../../../../services/account.service";
import { requireSignedIn } from "../../../../utils/require-auth";

// The signed-in User's own account; the User is always the session's, never read from the client. No Permission key.
export default defineEventHandler(async (event) => {
  const { userId } = await requireSignedIn(event);
  return getAccount({ db: useDb(), userId });
});
