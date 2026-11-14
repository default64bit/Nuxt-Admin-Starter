import { eq } from "drizzle-orm";
import { PERMISSION_KEYS, SUPER_ROLE_NAME } from "../../../shared/constants/permissions";
import * as schema from "../schema";
import type { Tx } from "../types";

/**
 * The Permission catalogue reconcile: runs on every seed run and in the test database harness. Add-only: it
 * inserts the keys that are missing, creates the `super` Role and grants it every key, and never removes a key or
 * any assignment made in the panel. Removing a key is a documented hand-written migration. Idempotent.
 *
 * Returns the `super` Role id for the seed versions that run after it.
 */
export async function reconcilePermissionCatalog(tx: Tx): Promise<string> {
  await tx
    .insert(schema.permissions)
    .values(PERMISSION_KEYS.map((key) => ({ key })))
    .onConflictDoNothing();
  await tx.insert(schema.roles).values({ name: SUPER_ROLE_NAME, isSuper: true }).onConflictDoNothing();
  const [superRole] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.isSuper, true));
  if (!superRole) throw new Error("the super role is missing after seeding");
  await tx
    .insert(schema.rolePermissions)
    .values(PERMISSION_KEYS.map((permissionKey) => ({ roleId: superRole.id, permissionKey })))
    .onConflictDoNothing();
  return superRole.id;
}
