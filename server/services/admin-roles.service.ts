import type { Db, Tx } from "../database/types";
import { PERMISSION_KEYS } from "../../shared/constants/permissions";
import { ADMIN_PAGE_SIZE, pageOffset } from "../../shared/schemas/admin-list";
import type { AdminRoleDetail, AdminRoleList, AdminRoleRow, RoleCreateBody, RoleListQuery, RoleOptionList, RoleSaveBody } from "../../shared/schemas/admin-roles";
import * as repository from "../repositories/admin-roles.repository";
import { containsPattern } from "../repositories/name-search";
import { DomainError, duplicateName, inUse, staleVersion, superRequired, superRoleProtected, validationFailed } from "../utils/domain-errors";
import { assertPermissionPrerequisites, type AdminActor } from "./authorization";

export interface RoleDeps {
  db: Db;
}

/** Who is acting on a Role: only a super actor may act on the `super` Role (and even they cannot change it). */
export type RoleActor = Pick<AdminActor, "userId" | "isSuper">;

const notFound = () => new DomainError(404, "Not Found", "not_found");

/** The pg error code of a driver error, whether it arrives bare or wrapped by Drizzle. */
function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

const fullName = (givenName: string | null, familyName: string | null) =>
  [givenName, familyName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ") || null;
/** Permission keys in catalogue order, so a Role reads the same everywhere. */
const inCatalogOrder = (keys: Iterable<string>) => {
  const held = new Set(keys);
  return PERMISSION_KEYS.filter((key) => held.has(key));
};

const toRow = (record: repository.RoleRecord): AdminRoleRow => ({
  id: record.id,
  name: record.name,
  isSuper: record.isSuper,
  permissionCount: record.permissionCount,
  memberCount: record.memberCount,
  updatedAt: record.updatedAt.toISOString(),
});

/** The Roles list: the `super` Role first, then by name, 20 per page. */
export async function listAdminRoles({ db }: RoleDeps, query: RoleListQuery): Promise<AdminRoleList> {
  const { rows, total } = await repository.listRoles(db, { pattern: query.q ? containsPattern(query.q) : undefined }, { offset: pageOffset(query.page), limit: ADMIN_PAGE_SIZE });
  return { items: rows.map(toRow), total, page: query.page, pageSize: ADMIN_PAGE_SIZE };
}

/** Every Role, for pickers and filters: open to `view-users` as well as `view-roles`, since the Users list already names each person's Roles. */
export const listRoleOptions = async ({ db }: RoleDeps, viewerIsSuper: boolean): Promise<RoleOptionList> => ({ items: await repository.listRoleOptions(db), viewerIsSuper });

async function detailOf(db: Db | Tx, id: string, actorId?: string): Promise<AdminRoleDetail> {
  const record = await repository.findRole(db, id);
  if (!record) throw notFound();
  const [keys, members, access] = await Promise.all([
    repository.permissionKeysOf(db, id),
    repository.membersOf(db, id),
    actorId ? repository.actorRoleAccess(db, actorId, id) : Promise.resolve({ holds: false, viaOtherRoles: [] as string[] }),
  ]);
  const permissions = inCatalogOrder(keys);
  const elsewhere = new Set(access.viaOtherRoles);
  return {
    ...toRow(record),
    permissions,
    members: members.map((member) => ({ id: member.id, name: fullName(member.givenName, member.familyName), phoneE164: member.phoneE164 })),
    heldByYou: access.holds,
    exclusiveToYou: access.holds ? permissions.filter((key) => !elsewhere.has(key)) : [],
  };
}

/**
 * One Role with its Permissions (catalogue order) and its members (name and phone). With the requesting User's id
 * it also says whether they hold the Role and which of its Permissions they hold only through it, which the
 * editor needs for its "Remove your own access?" confirm.
 */
export const getAdminRole = ({ db }: RoleDeps, id: string, actorId?: string): Promise<AdminRoleDetail> => detailOf(db, id, actorId);

/** The pg errors a Role write can hit, as the answers the API gives. */
function translate(error: unknown): never {
  const code = pgCode(error);
  if (code === "23505") throw duplicateName("name");
  if (code === "23503") throw validationFailed({ permissions: ["unknown"] }); // a key the seed has not inserted yet
  throw error;
}

/** Creates a Role. The unique index on `lower(btrim(name))` decides duplicates, so a race gets the same answer. */
export async function createRole(deps: RoleDeps, actor: RoleActor, body: RoleCreateBody): Promise<AdminRoleDetail> {
  assertPermissionPrerequisites(body.permissions);
  try {
    // One transaction per write: the audit slice records its event inside it.
    const id = await deps.db.transaction(async (tx) => {
      const created = await repository.insertRole(tx, body.name);
      await repository.addPermissions(tx, created, body.permissions);
      return created;
    });
    return await detailOf(deps.db, id, actor.userId);
  } catch (error) {
    return translate(error);
  }
}

/**
 * Locks the Role and checks who may touch it and at which version. The `super` Role is acted on by a super actor
 * only (`403 super_required` for anyone else), and is never changed or deleted by anyone (`409 super_role_protected`).
 */
async function lockedAt(tx: Tx, actor: RoleActor, id: string, expectedUpdatedAt: string) {
  const record = await repository.lockRole(tx, id);
  if (!record) throw notFound();
  if (record.isSuper) throw actor.isSuper ? superRoleProtected() : superRequired();
  if (new Date(expectedUpdatedAt).getTime() !== record.updatedAt.getTime()) throw staleVersion((await detailOf(tx, id)) as unknown as Record<string, unknown>);
  return record;
}

/**
 * Saves a Role: the name and the whole Permission set, which must hold every prerequisite (`422
 * permission_prerequisites`). The `super` Role cannot be changed at all. Only the difference is written, and a save
 * that changes nothing writes nothing and moves no version.
 */
export async function saveRole(deps: RoleDeps, actor: RoleActor, id: string, body: RoleSaveBody): Promise<AdminRoleDetail> {
  assertPermissionPrerequisites(body.permissions);
  try {
    await deps.db.transaction(async (tx) => {
      const current = await lockedAt(tx, actor, id, body.expectedUpdatedAt);
      const before = new Set(await repository.permissionKeysOf(tx, id));
      const after = new Set<string>(body.permissions);
      const added = inCatalogOrder([...after].filter((key) => !before.has(key)));
      const removed = inCatalogOrder([...before].filter((key) => !after.has(key)));
      if (current.name === body.name && added.length === 0 && removed.length === 0) return;
      await repository.removePermissions(tx, id, removed);
      await repository.addPermissions(tx, id, added);
      await repository.touchRole(tx, id, body.name);
    });
  } catch (error) {
    return translate(error);
  }
  return detailOf(deps.db, id, actor.userId);
}

/** Deletes a Role that no account holds (`409 in_use` with the member count otherwise). Its Permission rows go with it. */
export async function deleteRole(deps: RoleDeps, actor: RoleActor, id: string, expectedUpdatedAt: string): Promise<void> {
  try {
    await deps.db.transaction(async (tx) => {
      const current = await lockedAt(tx, actor, id, expectedUpdatedAt);
      if (current.memberCount > 0) throw inUse(current.memberCount);
      await repository.deleteRoleRow(tx, id);
    });
  } catch (error) {
    // A holder added after the member count was read: the foreign key still refuses.
    if (pgCode(error) === "23503") throw inUse();
    throw error;
  }
}
