import { z } from "zod";
import { requiredOrInvalid } from "./issue-messages";
import { PERMISSION_KEYS, type PermissionKey } from "../constants/permissions";
import { adminListQuerySchema } from "./admin-list";

// Shared by the Roles API (Zod at the boundary) and the Roles pages (.specs/users-and-roles/spec.md).

export const ROLE_NAME_MIN = 2;
export const ROLE_NAME_MAX = 40;

/** `GET` list: the shared `q` (a contains-match on the name) and `page`. */
export const roleListQuerySchema = adminListQuerySchema;
export type RoleListQuery = z.output<typeof roleListQuerySchema>;

const name = z.string(requiredOrInvalid).trim().min(ROLE_NAME_MIN, "too_short").max(ROLE_NAME_MAX, "too_long");
const permissions = z
  .array(z.enum(PERMISSION_KEYS, { error: "unknown" }), requiredOrInvalid)
  // A valid list names each key at most once, so it can never be longer than the catalogue.
  .max(PERMISSION_KEYS.length, "too_many")
  .superRefine((keys, ctx) => {
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "duplicate" });
  });
const version = z.string(requiredOrInvalid).datetime({ offset: true, message: "invalid" });

/** `POST`: the name and the Permission keys (the prerequisites must already be among them). */
export const roleCreateSchema = z.object({ name, permissions });
/** `PUT`: the whole Role plus the version it was loaded at (`409 stale_version` when it moved on). */
export const roleSaveSchema = z.object({ name, permissions, expectedUpdatedAt: version });
/** `DELETE`: the version rides in the query string. */
export const roleDeleteQuerySchema = z.object({ expectedUpdatedAt: version });

export type RoleCreateBody = z.output<typeof roleCreateSchema>;
export type RoleSaveBody = z.output<typeof roleSaveSchema>;
export type RoleDeleteQuery = z.output<typeof roleDeleteQuerySchema>;

export interface AdminRoleRow {
  id: string;
  /** Stored name; the `super` Role's is `super`, which the UI shows as "Super admin". */
  name: string;
  isSuper: boolean;
  permissionCount: number;
  memberCount: number;
  updatedAt: string;
}

export interface AdminRoleList {
  items: AdminRoleRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminRoleMember {
  id: string;
  /** Given then family name; null when the account has neither. */
  name: string | null;
  phoneE164: string;
}

export interface AdminRoleDetail extends AdminRoleRow {
  permissions: PermissionKey[];
  members: AdminRoleMember[];
  /** The requesting User holds this Role. */
  heldByYou: boolean;
  /**
   * Permissions of this Role that the requesting User holds through no other Role: removing one would take it
   * from them. Empty when they do not hold the Role.
   */
  exclusiveToYou: PermissionKey[];
}

/** The Role pickers' lookup: every Role, and whether the asking User holds `super` (only they may grant it). */
export interface RoleOptionList {
  items: RoleOption[];
  viewerIsSuper: boolean;
}

/** One Role in a picker or filter (`GET /api/v1/admin/options/roles`). */
export interface RoleOption {
  id: string;
  name: string;
  isSuper: boolean;
}
