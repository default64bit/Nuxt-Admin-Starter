import type { AccountResponse, AccountUpdateInput } from "../../shared/schemas/account";
import type { Db } from "../database/types";
import * as users from "../repositories/users.repository";
import { DomainError } from "../utils/domain-errors";
import { recordAudit } from "./admin-audit.service";

interface Base {
  db: Db;
  userId: string;
  /** The request id, written into the audit event as its correlation id. */
  requestId?: string | undefined;
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
export async function updateAccountNames({ db, userId, requestId, givenName, familyName }: Base & AccountUpdateInput): Promise<AccountResponse> {
  return db.transaction(async (tx) => {
    const before = await users.findAccountById(tx, userId);
    const row = await users.updateNames(tx, userId, { givenName, familyName });
    if (!before || !row) throw gone();
    // Only the fields that changed are recorded, before and after; a save that changes nothing records nothing.
    const old: Record<string, string | null> = {};
    const next: Record<string, string | null> = {};
    if (before.givenName !== givenName) [old.givenName, next.givenName] = [before.givenName, givenName];
    if (before.familyName !== familyName) [old.familyName, next.familyName] = [before.familyName, familyName];
    if (Object.keys(next).length > 0) {
      await recordAudit(tx, { actorUserId: userId, correlationId: requestId }, { action: "account.update", entityType: "user", entityId: userId, changeSummary: { old, new: next } });
    }
    return toResponse(row);
  });
}
