import { and, desc, eq, gt, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Executor } from "../database/types";
import { authSessions, roles, userRoles, users } from "../database/schema";
import { normalizedName } from "./name-search";

export interface UserListFilters {
  /** An exact phone (`+989...`). */
  phoneE164?: string;
  /** `%text%` with LIKE metacharacters escaped, matched against the normalized given and family names. */
  namePattern?: string;
  status?: "active" | "disabled";
  /** An account holding this Role. */
  roleId?: string;
}

export interface UserRecord {
  id: string;
  givenName: string | null;
  familyName: string | null;
  phoneE164: string;
  status: "active" | "disabled";
  isDefaultAdmin: boolean;
  isSelf: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date | null;
}

export interface RoleOfUser {
  userId: string;
  id: string;
  name: string;
  isSuper: boolean;
}

const columns = (actorId: string) => ({
  id: users.id,
  givenName: users.givenName,
  familyName: users.familyName,
  phoneE164: users.phoneE164,
  status: users.status,
  isDefaultAdmin: users.isDefaultAdmin,
  isSelf: sql<boolean>`${users.id} = ${actorId}`,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  // Any session counts, revoked ones too: it is when the account was last seen.
  lastActiveAt: sql<Date | null>`(SELECT max(s.last_seen_at) FROM auth_sessions s WHERE s.user_id = users.id)`,
});

function where(filters: UserListFilters): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    filters.phoneE164 ? eq(users.phoneE164, filters.phoneE164) : filters.namePattern ? sql`${normalizedName} LIKE ${filters.namePattern}` : undefined,
    filters.status ? eq(users.status, filters.status) : undefined,
    filters.roleId ? sql`EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = users.id AND ur.role_id = ${filters.roleId})` : undefined,
  ];
  const present = conditions.filter((condition): condition is SQL => condition !== undefined);
  return present.length ? and(...present) : undefined;
}

const toRecord = (row: Record<string, unknown>): UserRecord => ({ ...(row as unknown as UserRecord), lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt as string | Date) : null });

/** Newest accounts first, then id. */
export async function listUsers(db: Executor, actorId: string, filters: UserListFilters, page: { offset: number; limit: number }) {
  const condition = where(filters);
  const [rows, [counted]] = await Promise.all([
    db.select(columns(actorId)).from(users).where(condition).orderBy(desc(users.createdAt), desc(users.id)).limit(page.limit).offset(page.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(users).where(condition),
  ]);
  return { rows: rows.map(toRecord), total: counted?.total ?? 0 };
}

export async function findUser(db: Executor, actorId: string, id: string): Promise<UserRecord | undefined> {
  const [row] = await db.select(columns(actorId)).from(users).where(eq(users.id, id)).limit(1);
  return row ? toRecord(row) : undefined;
}

/** The Roles of several accounts at once: the `super` Role first, then by name. */
export async function rolesOfUsers(db: Executor, userIds: string[]): Promise<RoleOfUser[]> {
  if (userIds.length === 0) return [];
  return db
    .select({ userId: userRoles.userId, id: roles.id, name: roles.name, isSuper: roles.isSuper })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(userRoles.userId, userIds))
    .orderBy(desc(roles.isSuper), sql`lower(${roles.name})`, roles.id);
}

/** Sessions that are neither revoked nor past their idle or absolute expiry. */
export async function countActiveSessions(db: Executor, userId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(authSessions)
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt), gt(authSessions.idleExpiresAt, now), gt(authSessions.absoluteExpiresAt, now)));
  return row?.total ?? 0;
}

export interface LockedUser {
  givenName: string | null;
  familyName: string | null;
  status: "active" | "disabled";
  isDefaultAdmin: boolean;
  /** Holds the `super` Role. */
  holdsSuper: boolean;
  updatedAt: Date;
}

/** Locks the account row for the rest of the transaction and reads what the account actions decide on. */
export async function lockUser(tx: Executor, id: string): Promise<LockedUser | undefined> {
  const [row] = await tx
    .select({
      givenName: users.givenName,
      familyName: users.familyName,
      status: users.status,
      isDefaultAdmin: users.isDefaultAdmin,
      holdsSuper: sql<boolean>`EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = users.id AND r.is_super)`,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .for("update", { of: users })
    .limit(1);
  return row;
}

/** Takes a shared lock on each Role (in id order, so two assignments cannot deadlock) and returns the ones that exist. A concurrent Role delete waits for it or finds a holder. */
export async function lockRolesShared(tx: Executor, ids: string[]): Promise<{ id: string; isSuper: boolean }[]> {
  if (ids.length === 0) return [];
  return tx.select({ id: roles.id, isSuper: roles.isSuper }).from(roles).where(inArray(roles.id, ids)).orderBy(roles.id).for("share");
}

/** A new account: a verified phone comes with its owner's first sign-in, so none is recorded here. */
export async function insertUser(tx: Executor, values: { phoneE164: string; givenName?: string; familyName?: string }): Promise<string> {
  const [row] = await tx.insert(users).values(values).returning({ id: users.id });
  return row!.id;
}

export async function addUserRoles(tx: Executor, userId: string, roleIds: string[], assignedBy: string) {
  if (roleIds.length === 0) return;
  await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId, assignedBy })));
}

export async function removeUserRoles(tx: Executor, userId: string, roleIds: string[]) {
  if (roleIds.length === 0) return;
  await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.roleId, roleIds)));
}

/** Moves the version (and writes the changed columns): every change to an account calls this once. */
export async function touchUser(tx: Executor, id: string, values: Partial<{ givenName: string; familyName: string; status: "active" | "disabled" }> = {}) {
  await tx.update(users).set({ ...values, updatedAt: new Date() }).where(eq(users.id, id));
}
