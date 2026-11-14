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

export async function findStatusByPhone(db: Executor, phoneE164: string) {
  const [row] = await db.select({ status: users.status }).from(users).where(eq(users.phoneE164, phoneE164)).limit(1);
  return row?.status ?? null;
}

export async function findPhoneById(db: Executor, id: string) {
  const [row] = await db.select({ phoneE164: users.phoneE164, status: users.status }).from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

/** Replaces the sign-in phone. The unique index on `phone_e164` settles a race with another account. */
export async function changePhone(db: Executor, id: string, phoneE164: string, verifiedAt: Date) {
  await db.update(users).set({ phoneE164, phoneVerifiedAt: verifiedAt }).where(eq(users.id, id));
}

export async function findAccountById(db: Executor, id: string) {
  const [row] = await db
    .select({ givenName: users.givenName, familyName: users.familyName, phoneE164: users.phoneE164 })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

/** Sets both names and returns the account, or null when the user does not exist. */
export async function updateNames(db: Executor, id: string, names: { givenName: string; familyName: string }) {
  const [row] = await db
    .update(users)
    .set(names)
    .where(eq(users.id, id))
    .returning({ givenName: users.givenName, familyName: users.familyName, phoneE164: users.phoneE164 });
  return row ?? null;
}
