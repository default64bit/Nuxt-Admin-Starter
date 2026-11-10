import { eq } from "drizzle-orm";
import type { Executor } from "../database/types";
import { users } from "../database/schema";

/** The account behind a phone, or null when there is none. Sign-in never creates accounts. */
export async function findByPhone(db: Executor, phoneE164: string) {
  const [row] = await db
    .select({ id: users.id, status: users.status, phoneVerifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.phoneE164, phoneE164))
    .limit(1);
  return row ?? null;
}

export async function markPhoneVerified(db: Executor, id: string, verifiedAt: Date) {
  await db.update(users).set({ phoneVerifiedAt: verifiedAt }).where(eq(users.id, id));
}
