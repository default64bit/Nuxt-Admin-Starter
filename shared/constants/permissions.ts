// The canonical Permission catalogue (.specs/users-and-roles/spec.md). Permissions are defined in code and seeded;
// they are never created or edited in the panel. Adding a key here is picked up by the next seed run, which also
// grants it to the `super` Role. A key also needs a group and a prerequisite entry in `permission-catalog.ts` and an
// `fa`/`en` label and hint under `admin.permissions.keys`; the completeness test fails until all of them exist.
// There is deliberately no `delete-users` key: accounts are never deleted.
export const PERMISSION_KEYS = [
  // Users
  "view-users",
  "create-users",
  "edit-users",
  "disable-users",
  // Roles
  "view-roles",
  "manage-roles",
  // Audit
  "view-audit-log",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export const SUPER_ROLE_NAME = "super";
