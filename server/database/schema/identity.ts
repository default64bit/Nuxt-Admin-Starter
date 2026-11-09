import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt, uuidPk } from "./_helpers";
import { userStatusEnum } from "./enums";

// There is one kind of account. Accounts are never deleted; `disabled` is the only deactivation. Every User holds
// at least one Role, so there is deliberately no is_admin column.
export const users = pgTable(
  "users",
  {
    id: uuidPk(),
    phoneE164: text("phone_e164").notNull(),
    phoneVerifiedAt: timestamptz(),
    givenName: text(),
    familyName: text(),
    status: userStatusEnum().notNull().default("active"),
    isDefaultAdmin: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_phone_e164_unique").on(t.phoneE164),
    // The Users list: newest accounts first, then id.
    index("users_created_idx").on(t.createdAt.desc(), t.id.desc()),
    // Exactly one Default admin.
    uniqueIndex("users_single_default_admin_unique")
      .on(t.isDefaultAdmin)
      .where(sql`${t.isDefaultAdmin}`),
    // The Starter default is an Iranian mobile number; a Project serving another country changes this CHECK.
    check("users_phone_e164_format", sql`${t.phoneE164} ~ '^\\+989[0-9]{9}$'`),
    check("users_default_admin_never_disabled", sql`NOT (${t.isDefaultAdmin} AND ${t.status} = 'disabled')`),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuidPk(),
    name: text().notNull(),
    isSuper: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("roles_name_unique").on(t.name),
    // Role names are unique ignoring case and surrounding spaces.
    uniqueIndex("roles_name_normalized_unique").on(sql`lower(btrim(${t.name}))`),
    uniqueIndex("roles_single_super_unique")
      .on(t.isSuper)
      .where(sql`${t.isSuper}`),
  ],
);

// Code-defined, seeded Permission keys (e.g. `manage-roles`). Never created through the panel.
export const permissions = pgTable("permissions", {
  key: text().primaryKey(),
  createdAt: createdAt(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text()
      .notNull()
      .references(() => permissions.key, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    assignedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    assignedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index("user_roles_role_idx").on(t.roleId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
