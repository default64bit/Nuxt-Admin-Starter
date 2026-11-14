import { asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { Executor } from "../database/types";
import { rolePermissions, roles, userRoles, users } from "../database/schema";

export interface RoleRecord {
  id: string;
  name: string;
  isSuper: boolean;
  permissionCount: number;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const count = (query: ReturnType<typeof sql>) => sql<number>`(${query})::int`;
// The outer table is named explicitly: Drizzle renders a bare column name in a raw subquery.
const columns = {
  id: roles.id,
  name: roles.name,
  isSuper: roles.isSuper,
  permissionCount: count(sql`SELECT count(*) FROM role_permissions rp WHERE rp.role_id = roles.id`),
  memberCount: count(sql`SELECT count(*) FROM user_roles ur WHERE ur.role_id = roles.id`),
  createdAt: roles.createdAt,
  updatedAt: roles.updatedAt,
};

/** The `super` Role first, then names alphabetically ignoring case, then id. */
export async function listRoles(db: Executor, filters: { pattern?: string }, page: { offset: number; limit: number }) {
  const where = filters.pattern ? ilike(roles.name, filters.pattern) : undefined;
  const [rows, [counted]] = await Promise.all([
    db.select(columns).from(roles).where(where).orderBy(desc(roles.isSuper), sql`lower(${roles.name})`, asc(roles.id)).limit(page.limit).offset(page.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(roles).where(where),
  ]);
  return { rows: rows as RoleRecord[], total: counted?.total ?? 0 };
}

/** Every Role, lean: for pickers and filters. The `super` Role first, then names ignoring case. */
export async function listRoleOptions(db: Executor): Promise<{ id: string; name: string; isSuper: boolean }[]> {
  return db.select({ id: roles.id, name: roles.name, isSuper: roles.isSuper }).from(roles).orderBy(desc(roles.isSuper), sql`lower(${roles.name})`, asc(roles.id));
}

export async function findRole(db: Executor, id: string): Promise<RoleRecord | undefined> {
  const [row] = await db.select(columns).from(roles).where(eq(roles.id, id)).limit(1);
  return row as RoleRecord | undefined;
}

/** Locks the Role row until the transaction ends, so two saves, or a save and a delete, cannot interleave. */
export async function lockRole(tx: Executor, id: string): Promise<RoleRecord | undefined> {
  const [row] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, id)).for("update").limit(1);
  return row ? findRole(tx, id) : undefined;
}

export async function permissionKeysOf(db: Executor, roleId: string): Promise<string[]> {
  return (await db.select({ key: rolePermissions.permissionKey }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId))).map((row) => row.key);
}

export async function membersOf(db: Executor, roleId: string) {
  return db
    .select({ id: users.id, givenName: users.givenName, familyName: users.familyName, phoneE164: users.phoneE164 })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(eq(userRoles.roleId, roleId))
    .orderBy(sql`lower(coalesce(${users.givenName}, '') || ' ' || coalesce(${users.familyName}, ''))`, asc(users.phoneE164));
}

export async function insertRole(tx: Executor, name: string): Promise<string> {
  const [row] = await tx.insert(roles).values({ name }).returning({ id: roles.id });
  return row!.id;
}

/** Writes the name and moves the version, which a change of Permissions alone must do as well. */
export async function touchRole(tx: Executor, id: string, name: string) {
  await tx.update(roles).set({ name, updatedAt: new Date() }).where(eq(roles.id, id));
}

export async function addPermissions(tx: Executor, roleId: string, keys: string[]) {
  if (keys.length > 0) await tx.insert(rolePermissions).values(keys.map((permissionKey) => ({ roleId, permissionKey })));
}

export async function removePermissions(tx: Executor, roleId: string, keys: string[]) {
  if (keys.length > 0) await tx.delete(rolePermissions).where(sql`${rolePermissions.roleId} = ${roleId} AND ${inArray(rolePermissions.permissionKey, keys)}`);
}

/** Deletes the Role; its Permission rows go with it (cascade). */
export async function deleteRoleRow(tx: Executor, id: string) {
  await tx.delete(roles).where(eq(roles.id, id));
}

/** Whether the account holds the Role, and the Permission keys it holds through its other Roles. */
export async function actorRoleAccess(db: Executor, actorId: string, roleId: string): Promise<{ holds: boolean; viaOtherRoles: string[] }> {
  const held = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, actorId));
  const holds = held.some((row) => row.roleId === roleId);
  const others = held.map((row) => row.roleId).filter((id) => id !== roleId);
  if (!holds || others.length === 0) return { holds, viaOtherRoles: [] };
  const rows = await db.selectDistinct({ key: rolePermissions.permissionKey }).from(rolePermissions).where(inArray(rolePermissions.roleId, others));
  return { holds, viaOtherRoles: rows.map((row) => row.key) };
}
