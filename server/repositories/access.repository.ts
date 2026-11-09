import { eq } from "drizzle-orm";
import type { Executor } from "../database/types";
import { rolePermissions, roles, userRoles } from "../database/schema";

/**
 * Everything the authorization gate needs about an account, read fresh on every request so a change to Roles or
 * Permissions takes effect at the next one: whether it holds `super`, and the sorted union of its Permission keys.
 */
export async function permissionKeysForUser(db: Executor, userId: string): Promise<{ isSuper: boolean; keys: string[] }> {
  const memberships = await db
    .select({ isSuper: roles.isSuper })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  if (memberships.length === 0) return { isSuper: false, keys: [] };
  const rows = await db
    .selectDistinct({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .innerJoin(userRoles, eq(userRoles.roleId, rolePermissions.roleId))
    .where(eq(userRoles.userId, userId));
  return { isSuper: memberships.some((membership) => membership.isSuper), keys: rows.map((row) => row.key).sort() };
}
