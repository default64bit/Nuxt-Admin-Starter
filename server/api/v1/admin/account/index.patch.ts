import { accountUpdateSchema } from "../../../../../shared/schemas/account";
import { updateAccountNames } from "../../../../services/account.service";
import { parseBody } from "../../../../utils/parse-body";
import { requireSignedIn } from "../../../../utils/require-auth";

// Saves the signed-in User's own two names; nothing else about the account can be changed here.
export default defineEventHandler(async (event) => {
  const { userId } = await requireSignedIn(event);
  const body = await parseBody(event, accountUpdateSchema);
  return updateAccountNames({ db: useDb(), userId, ...body });
});
