import type { AccountResponse, AccountUpdateInput } from "../../shared/schemas/account";
import type { Db } from "../database/types";
import * as users from "../repositories/users.repository";
import { DomainError } from "../utils/domain-errors";

interface Base {
  db: Db;
  userId: string;
}

const gone = () => new DomainError(401, "Unauthorized", "unauthenticated");
const toResponse = (row: { givenName: string | null; familyName: string | null; phoneE164: string }): AccountResponse => ({
  givenName: row.givenName,
  familyName: row.familyName,
  phone: row.phoneE164,
});

/** The signed-in User's own identity: names (null until set) and the canonical sign-in phone. */
export async function getAccount({ db, userId }: Base): Promise<AccountResponse> {
  const row = await users.findAccountById(db, userId);
  if (!row) throw gone();
  return toResponse(row);
}

/**
 * Saves the two names. Only `users` changes, and the session payload (read from `users` on every request) shows
 * the new names at once. The names arrive already cleaned by the shared schema.
 */
export async function updateAccountNames({ db, userId, givenName, familyName }: Base & AccountUpdateInput): Promise<AccountResponse> {
  const row = await users.updateNames(db, userId, { givenName, familyName });
  if (!row) throw gone();
  return toResponse(row);
}
