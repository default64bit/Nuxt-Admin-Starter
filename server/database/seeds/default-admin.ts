import { eq } from "drizzle-orm";
import { normalizeIranianMobile } from "../../../shared/utils/phone";
import * as schema from "../schema";
import type { Tx } from "../types";
import type { SeedEnv, SeedReport } from "./index";

/**
 * Seeds the Default admin once from the environment: exactly one account, holding `super`. Returns false (and so is
 * not recorded) when no phone is configured, so a later run with the variable set can still create it; the seed
 * warns and a deploy never blocks. Once recorded, later changes to the env values never touch the account.
 */
export async function seedDefaultAdmin(tx: Tx, env: SeedEnv, report: SeedReport): Promise<boolean> {
  const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isDefaultAdmin, true));
  if (existing) return true;
  if (!env.DEFAULT_ADMIN_PHONE?.trim()) {
    report.warnings.push("DEFAULT_ADMIN_PHONE is not set; no Default admin was created. The next seed run retries.");
    return false;
  }
  const phone = normalizeIranianMobile(env.DEFAULT_ADMIN_PHONE);
  if (!phone) throw new Error("DEFAULT_ADMIN_PHONE is not a valid mobile number");
  const [superRole] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.isSuper, true));
  if (!superRole) throw new Error("the super role is missing; the Permission reconcile runs first");
  const [user] = await tx
    .insert(schema.users)
    .values({
      phoneE164: phone,
      givenName: env.DEFAULT_ADMIN_GIVEN_NAME?.trim() || null,
      familyName: env.DEFAULT_ADMIN_FAMILY_NAME?.trim() || null,
      isDefaultAdmin: true,
    })
    .onConflictDoUpdate({ target: schema.users.phoneE164, set: { isDefaultAdmin: true } })
    .returning({ id: schema.users.id });
  await tx.insert(schema.userRoles).values({ userId: user!.id, roleId: superRole.id }).onConflictDoNothing();
  return true;
}
