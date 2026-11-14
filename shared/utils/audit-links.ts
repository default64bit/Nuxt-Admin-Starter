import type { PermissionKey } from "../constants/permissions";

// Open links of the Details panel (.specs/audit-log/spec.md "Details panel"): an event links to its record's own admin
// page only when the entity has one, the viewer holds that page's Permission and the record still exists. Everything
// else (every `*.delete`, sign-in events, unknown keys) has no link.
export type AuditLookupType = "user" | "role";
export type AuditLinkKind = "user" | "role";

export interface AuditOpenLink {
  kind: AuditLinkKind;
  /** The path without the locale prefix; the client adds `/en`. */
  path: string;
  /** The nav Permission of the page it opens. */
  permission: PermissionKey;
  /** The record that must still exist for the link to show. */
  lookup: { type: AuditLookupType; id: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (value: unknown): string | null => (typeof value === "string" && UUID.test(value) ? value : null);

/** The link of an event, or null. */
export function auditOpenLinkOf(action: string, entityType: string, entityId: string | null): AuditOpenLink | null {
  const id = uuid(entityId);
  if (!id || action.endsWith(".delete") || action.startsWith("auth.")) return null;
  if (entityType === "user") return { kind: "user", path: `/admin/users/${id}`, permission: "view-users", lookup: { type: "user", id } };
  if (entityType === "role") return { kind: "role", path: `/admin/roles/${id}`, permission: "view-roles", lookup: { type: "role", id } };
  return null;
}
