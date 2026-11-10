import type { Db, Tx } from "../database/types";
import { ADMIN_PAGE_SIZE, pageOffset } from "../../shared/schemas/admin-list";
import type {
  AdminUserDetail,
  AdminUserList,
  AdminUserPage,
  AdminUserRow,
  UserCreateBody,
  UserListQuery,
  UserNamesBody,
  UserRolesBody,
  UserStatusBody,
} from "../../shared/schemas/admin-users";
import { normalizeIranianMobile } from "../../shared/utils/phone";
import { normalizeSearchText } from "../../shared/utils/search-normalize";
import * as repository from "../repositories/admin-users.repository";
import * as accounts from "../repositories/users.repository";
import { containsPattern } from "../repositories/name-search";
import { DomainError, defaultAdminProtected, invalidTransition, ownAccount, phoneInUse, staleVersion, superRequired, validationFailed } from "../utils/domain-errors";
import type { AdminActor } from "./authorization";
import { revokeAllSessions } from "./session.service";

export interface AdminUserDeps {
  db: Db;
  now?: () => Date;
}

/** Who is acting: their id (own-account rules) and whether they hold `super` (read per request by the guard). */
export type UserActor = Pick<AdminActor, "userId" | "isSuper">;

const notFound = () => new DomainError(404, "Not Found", "not_found");
const unknownRoles = () => validationFailed({ roleIds: ["unknown"] });
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/** The pg error code of a driver error, whether it arrives bare or wrapped by Drizzle. */
function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

/**
 * The search box is one field with two meanings: an Iranian mobile number is an exact phone match across every
 * account; anything else is a normalized contains-match on the given and family names.
 */
export function classifyUserSearch(q: string | undefined): { phoneE164?: string; namePattern?: string } {
  if (!q) return {};
  const phoneE164 = normalizeIranianMobile(q);
  if (phoneE164) return { phoneE164 };
  const normalized = normalizeSearchText(q);
  return normalized ? { namePattern: containsPattern(normalized) } : {};
}

function toRow(record: repository.UserRecord, roles: repository.RoleOfUser[]): AdminUserRow {
  return {
    id: record.id,
    givenName: record.givenName,
    familyName: record.familyName,
    phoneE164: record.phoneE164,
    status: record.status,
    isDefaultAdmin: record.isDefaultAdmin,
    isSelf: record.isSelf,
    roles: roles.filter((role) => role.userId === record.id).map(({ id, name, isSuper }) => ({ id, name, isSuper })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastActiveAt: record.lastActiveAt?.toISOString() ?? null,
  };
}

/** The Users list: every account, newest first, 20 per page. A read: nothing is written. */
export async function listAdminUsers({ db }: AdminUserDeps, actorId: string, query: UserListQuery): Promise<AdminUserList> {
  const { rows, total } = await repository.listUsers(db, actorId, { ...classifyUserSearch(query.q), status: query.status, roleId: query.role }, { offset: pageOffset(query.page), limit: ADMIN_PAGE_SIZE });
  const roles = await repository.rolesOfUsers(
    db,
    rows.map((row) => row.id),
  );
  return { items: rows.map((row) => toRow(row, roles)), total, page: query.page, pageSize: ADMIN_PAGE_SIZE };
}

/** One account: the list item plus its number of active sessions. An unknown id is a 404. */
export async function getAdminUser({ db, now = () => new Date() }: { db: Db | Tx; now?: () => Date }, actorId: string, id: string): Promise<AdminUserDetail> {
  const record = await repository.findUser(db, actorId, id);
  if (!record) throw notFound();
  const [roles, activeSessionCount] = await Promise.all([repository.rolesOfUsers(db, [id]), repository.countActiveSessions(db, id, now())]);
  return { ...toRow(record, roles), activeSessionCount };
}

/** The User page's read: the account plus whether the viewer holds `super`. */
export async function getAdminUserPage(deps: AdminUserDeps, actor: UserActor, id: string): Promise<AdminUserPage> {
  return { ...(await getAdminUser(deps, actor.userId, id)), viewerIsSuper: actor.isSuper };
}

/**
 * Share-locks the Roles about to be assigned (so a concurrent Role delete waits and then finds a holder, or has
 * already removed the Role and the assignment finds it gone) and refuses an unknown Role, or `super` from a
 * non-super actor.
 */
async function lockAssignableRoles(tx: Tx, actor: UserActor, roleIds: string[]) {
  const found = await repository.lockRolesShared(tx, roleIds);
  if (found.length !== roleIds.length) throw unknownRoles();
  if (found.some((role) => role.isSuper) && !actor.isSuper) throw superRequired();
  return found;
}

/**
 * Creates a User with at least one Role. The handler has checked `create-users` and `manage-roles`; `super` needs a
 * super actor. No code or SMS is sent and no phone is marked verified: that happens at the person's first sign-in.
 * An existing phone answers `409 phone_in_use` with that account's id.
 */
export async function createUser(deps: AdminUserDeps, actor: UserActor, body: UserCreateBody): Promise<AdminUserDetail> {
  try {
    // One transaction per write: the audit slice records its event inside it.
    const id = await deps.db.transaction(async (tx) => {
      await lockAssignableRoles(tx, actor, body.roleIds);
      const existing = await accounts.findByPhone(tx, body.phone);
      if (existing) throw phoneInUse(existing.id);
      const created = await repository.insertUser(tx, { phoneE164: body.phone, givenName: body.givenName, familyName: body.familyName });
      await repository.addUserRoles(tx, created, body.roleIds, actor.userId);
      return created;
    });
    return await getAdminUser(deps, actor.userId, id);
  } catch (error) {
    // Two creations of one phone at once: the unique index decides, and the loser gets the same answer.
    if (pgCode(error) === "23505") {
      const winner = await accounts.findByPhone(deps.db, body.phone);
      if (winner) throw phoneInUse(winner.id);
    }
    throw error;
  }
}

/** Locks the account and checks the version it is being changed at (`409 stale_version` with the account as it is now otherwise). */
async function lockedAt(tx: Tx, actor: UserActor, id: string, expectedUpdatedAt: string) {
  const account = await repository.lockUser(tx, id);
  if (!account) throw notFound();
  if (new Date(expectedUpdatedAt).getTime() !== account.updatedAt.getTime()) throw staleVersion((await getAdminUser({ db: tx }, actor.userId, id)) as unknown as Record<string, unknown>);
  return account;
}

/**
 * Edits the two names only (the phone belongs to its owner). Works on any account, the Default admin's and one's own
 * included. A save that changes nothing writes nothing and moves no version.
 */
export async function updateUserNames(deps: AdminUserDeps, actor: UserActor, id: string, body: UserNamesBody): Promise<AdminUserDetail> {
  await deps.db.transaction(async (tx) => {
    const account = await lockedAt(tx, actor, id, body.expectedUpdatedAt);
    if (account.givenName === body.givenName && account.familyName === body.familyName) return;
    await repository.touchUser(tx, id, { givenName: body.givenName, familyName: body.familyName });
  });
  return getAdminUser(deps, actor.userId, id);
}

/**
 * Sets the whole set of Roles a User holds (at least one). Never on one's own account; any change to a super
 * account and any grant of `super` needs a super actor; the Default admin keeps `super`. Sessions are not revoked:
 * the next request reads the new Roles. A save that changes nothing writes nothing.
 */
export async function setUserRoles(deps: AdminUserDeps, actor: UserActor, id: string, body: UserRolesBody): Promise<AdminUserDetail> {
  await deps.db.transaction(async (tx) => {
    const account = await lockedAt(tx, actor, id, body.expectedUpdatedAt);
    if (id === actor.userId) throw ownAccount();
    const found = await lockAssignableRoles(tx, actor, body.roleIds);
    if (account.holdsSuper && !actor.isSuper) throw superRequired();
    if (account.isDefaultAdmin && !found.some((role) => role.isSuper)) throw defaultAdminProtected();
    const before = (await repository.rolesOfUsers(tx, [id])).map((role) => role.id);
    if (sameSet(before, body.roleIds)) return;
    await repository.removeUserRoles(
      tx,
      id,
      before.filter((roleId) => !body.roleIds.includes(roleId)),
    );
    await repository.addUserRoles(
      tx,
      id,
      body.roleIds.filter((roleId) => !before.includes(roleId)),
      actor.userId,
    );
    await repository.touchUser(tx, id);
  });
  return getAdminUser(deps, actor.userId, id);
}

/**
 * Locks the account and applies the rules every disable and enable shares, in this order: unknown id, stale
 * version, the Default admin, one's own account, and a super account for a non-super actor.
 */
async function lockedForStatusChange(tx: Tx, actor: UserActor, id: string, body: UserStatusBody, from: "active" | "disabled") {
  const account = await lockedAt(tx, actor, id, body.expectedUpdatedAt);
  if (account.isDefaultAdmin) throw defaultAdminProtected();
  if (id === actor.userId) throw ownAccount();
  if (account.holdsSuper && !actor.isSuper) throw superRequired();
  if (account.status !== from) throw invalidTransition();
}

/**
 * Disables an account in one transaction: it can no longer sign in and every session is revoked, so access ends with
 * the next request. Roles are kept. Accounts are never deleted.
 */
export async function disableUser(deps: AdminUserDeps, actor: UserActor, id: string, body: UserStatusBody): Promise<AdminUserDetail> {
  const now = deps.now ?? (() => new Date());
  await deps.db.transaction(async (tx) => {
    await lockedForStatusChange(tx, actor, id, body, "active");
    await repository.touchUser(tx, id, { status: "disabled" });
    await revokeAllSessions(id, "account_disabled", { db: tx, now });
  });
  return getAdminUser(deps, actor.userId, id);
}

/** Re-enables a disabled account. No session is restored (the person signs in again) and the Roles it kept apply again. */
export async function enableUser(deps: AdminUserDeps, actor: UserActor, id: string, body: UserStatusBody): Promise<AdminUserDetail> {
  await deps.db.transaction(async (tx) => {
    await lockedForStatusChange(tx, actor, id, body, "disabled");
    await repository.touchUser(tx, id, { status: "active" });
  });
  return getAdminUser(deps, actor.userId, id);
}
