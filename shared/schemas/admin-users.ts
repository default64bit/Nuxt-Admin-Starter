import { z } from "zod";
import { requiredOrInvalid } from "./issue-messages";
import { USER_STATUSES } from "../constants/database-enums";
import { normalizeIranianMobile } from "../utils/phone";
import { accountUpdateSchema, personNameSchema } from "./account";
import { adminListQuerySchema } from "./admin-list";

// Shared by the Users API (Zod at the boundary) and the Users pages (.specs/users-and-roles/spec.md).

/** `GET` list: the shared `q` and `page`, plus the status and Role filters. */
export const userListQuerySchema = adminListQuerySchema.extend({
  status: z.enum(USER_STATUSES).optional(),
  role: z.uuid("invalid").optional(),
});
export type UserListQuery = z.output<typeof userListQuerySchema>;

export interface AdminUserRole {
  id: string;
  name: string;
  isSuper: boolean;
}

export interface AdminUserRow {
  id: string;
  givenName: string | null;
  familyName: string | null;
  phoneE164: string;
  status: (typeof USER_STATUSES)[number];
  isDefaultAdmin: boolean;
  /** The requesting User's own account. */
  isSelf: boolean;
  /** The `super` Role first, then by name. */
  roles: AdminUserRole[];
  createdAt: string;
  /** The User's version: every change to the account moves it, and every write names the one it was loaded at. */
  updatedAt: string;
  /** The latest `last_seen_at` of any of the User's sessions; null if they never signed in. */
  lastActiveAt: string | null;
}

export interface AdminUserDetail extends AdminUserRow {
  /** Sessions that are neither revoked nor expired. */
  activeSessionCount: number;
}

/** `GET .../{id}`: the detail plus whether the viewing User holds `super`, so the page hides what the rules refuse them. */
export interface AdminUserPage extends AdminUserDetail {
  viewerIsSuper: boolean;
}

export interface AdminUserList {
  items: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

const version = z.string(requiredOrInvalid).datetime({ offset: true, message: "invalid" });

/** A User holds at least one Role, so a set of Roles is never empty; the list is capped and de-duplicated. */
const roleIds = z
  .array(z.uuid("invalid"), requiredOrInvalid)
  .min(1, "required")
  .max(50, "too_many")
  .transform((ids) => [...new Set(ids)]);

/** `PATCH .../{id}`: both names with the My account rules (1 to 50 characters, trimmed) and the version; nothing else, so a stray `phone` is refused. */
export const userNamesSchema = accountUpdateSchema.extend({ expectedUpdatedAt: version }).strict();
export type UserNamesBody = z.output<typeof userNamesSchema>;

/** `POST .../{id}/disable` and `.../enable`: the version the User was loaded at. */
export const userStatusBodySchema = z.object({ expectedUpdatedAt: version }).strict();
export type UserStatusBody = z.output<typeof userStatusBodySchema>;

/** `PUT .../{id}/roles`: the whole set of Roles the User should hold, at least one, and the version. */
export const userRolesSchema = z.object({ roleIds, expectedUpdatedAt: version }).strict();
export type UserRolesBody = z.output<typeof userRolesSchema>;

/**
 * `POST` create: the phone (any Iranian mobile form, stored as `+989XXXXXXXXX`), both names or neither, and at least
 * one Role. No code or SMS is sent.
 */
export const userCreateSchema = z
  .object({
    phone: z.string(requiredOrInvalid).transform((value, ctx) => {
      const normalized = normalizeIranianMobile(value);
      if (!normalized) ctx.addIssue({ code: "custom", message: "invalid" });
      return normalized ?? z.NEVER;
    }),
    givenName: personNameSchema.optional(),
    familyName: personNameSchema.optional(),
    roleIds,
  })
  .strict()
  .superRefine((body, ctx) => {
    // Both names or neither: the missing one is the one the form must fill.
    if (body.givenName !== undefined && body.familyName === undefined) ctx.addIssue({ code: "custom", path: ["familyName"], message: "required" });
    if (body.familyName !== undefined && body.givenName === undefined) ctx.addIssue({ code: "custom", path: ["givenName"], message: "required" });
  });
export type UserCreateBody = z.output<typeof userCreateSchema>;
