// The one place that knows what audit action keys mean (.specs/audit-log/spec.md "Action-key registry"): each key's
// group in the Action filter. Labels are vue-i18n messages at `admin.auditLog.actions.<lowerCamel key>`
// (`user.disable` -> `userDisable`, `account.change_phone` -> `accountChangePhone`, since message keys are lowerCamel).
// Stored keys are never renamed. A key that is not here is shown raw under "Other", never hidden.
// A Project adds its own rows here (and its labels in both locales) when it adds audited actions.
export const AUDIT_GROUPS = [
  "people",
  "account",
  "auth",
  "system",
  // demo-ticket:start
  "demoTickets",
  // demo-ticket:end
] as const;
export type AuditGroup = (typeof AUDIT_GROUPS)[number];

export const AUDIT_ACTIONS = {
  "user.create": { group: "people" },
  "user.update": { group: "people" },
  "user.roles": { group: "people" },
  "user.disable": { group: "people" },
  "user.enable": { group: "people" },
  "role.create": { group: "people" },
  "role.update": { group: "people" },
  "role.delete": { group: "people" },
  "account.update": { group: "account" },
  "account.change_phone": { group: "account" },
  "auth.sign_in": { group: "auth" },
  "auth.sign_out": { group: "auth" },
  "audit.attempts_suppressed": { group: "system" },
  // demo-ticket:start
  "demo_ticket.created": { group: "demoTickets" },
  "demo_ticket.updated": { group: "demoTickets" },
  "demo_ticket.status_changed": { group: "demoTickets" },
  "demo_ticket.deleted": { group: "demoTickets" },
  // demo-ticket:end
} as const satisfies Record<string, { group: AuditGroup }>;
export type KnownAuditAction = keyof typeof AUDIT_ACTIONS;

export function isKnownAuditAction(action: string): action is KnownAuditAction {
  return Object.hasOwn(AUDIT_ACTIONS, action);
}

/** The group of a stored action key, or null for an unknown key (shown as "Other"). */
export function auditGroupOf(action: string): AuditGroup | null {
  return isKnownAuditAction(action) ? AUDIT_ACTIONS[action].group : null;
}

/** The vue-i18n path of a known action's label. */
export function auditActionLabelPath(action: KnownAuditAction): string {
  const [first = "", ...rest] = action.split(/[._-]/);
  return `admin.auditLog.actions.${first}${rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")}`;
}

/** The exact keys a group selects: the Action group filter is derived from the registry, never a second list. */
export const auditKeysOfGroup = (group: AuditGroup): KnownAuditAction[] => (Object.keys(AUDIT_ACTIONS) as KnownAuditAction[]).filter((key) => AUDIT_ACTIONS[key].group === group);
