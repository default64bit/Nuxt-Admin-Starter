import type { PermissionKey } from "./permissions";

// The presentation and dependency data of the Permission catalogue: which group each key belongs to and which keys it
// needs. The role editor and the server both read this map, so both enforce the same prerequisites.
// Labels and hints live in i18n under `admin.permissions.*`.

export const PERMISSION_GROUP_IDS = [
  "users",
  "roles",
  "audit",
  // demo-ticket:start
  "demoTickets",
  // demo-ticket:end
] as const;
export type PermissionGroupId = (typeof PERMISSION_GROUP_IDS)[number];

/** The groups in editor order, each with its keys in display order. */
export const PERMISSION_GROUPS: readonly { id: PermissionGroupId; keys: readonly PermissionKey[] }[] = [
  { id: "users", keys: ["view-users", "create-users", "edit-users", "disable-users"] },
  { id: "roles", keys: ["view-roles", "manage-roles"] },
  { id: "audit", keys: ["view-audit-log"] },
  // demo-ticket:start
  { id: "demoTickets", keys: ["view-demo-tickets", "manage-demo-tickets"] },
  // demo-ticket:end
];

/** The group a key belongs to. */
export const PERMISSION_GROUP_OF: Readonly<Record<PermissionKey, PermissionGroupId>> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((group) => group.keys.map((key) => [key, group.id])),
) as Record<PermissionKey, PermissionGroupId>;

/**
 * Direct prerequisites: a Role holding a key must hold everything listed for it. Every catalogue key has an entry
 * (an empty list is a decision, not an omission). The server answers `422 permission_prerequisites` for a Role that
 * breaks one. Creating a User also needs `manage-roles` (every User holds a Role); that is an action rule, not a
 * prerequisite of `create-users`.
 */
export const PERMISSION_PREREQUISITES: Readonly<Record<PermissionKey, readonly PermissionKey[]>> = {
  "view-users": [],
  "create-users": ["view-users"],
  "edit-users": ["view-users"],
  "disable-users": ["view-users"],
  "view-roles": [],
  "manage-roles": ["view-roles"],
  "view-audit-log": [],
  // demo-ticket:start
  "view-demo-tickets": [],
  "manage-demo-tickets": ["view-demo-tickets"],
  // demo-ticket:end
};

const camel = (value: string) => value.replace(/-(\w)/g, (_, char: string) => char.toUpperCase());

/** The i18n key of a Permission's label (`admin.permissions.keys.viewUsers.label`). */
export const permissionLabelKey = (key: PermissionKey) => `admin.permissions.keys.${camel(key)}.label`;
/** The i18n key of a Permission's one-line hint. */
export const permissionHintKey = (key: PermissionKey) => `admin.permissions.keys.${camel(key)}.hint`;
/** The i18n key of a group's label. */
export const permissionGroupLabelKey = (id: PermissionGroupId) => `admin.permissions.groups.${id}.label`;
/** The i18n key of a group's one-line hint. */
export const permissionGroupHintKey = (id: PermissionGroupId) => `admin.permissions.groups.${id}.hint`;
