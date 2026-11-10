// The closed set of reasons a refused admin attempt is recorded under (.specs/audit-log/spec.md "Refused attempts are
// recorded safely"), and which API answers map to one. Anything not listed here is not an audit event: validation (400),
// not found (404), stale versions and other state conflicts (409, 422), throttling (429) and server errors (5xx).
export const AUDIT_REASON_CODES = ["missing_permission", "own_account", "super_required", "default_admin_protected", "super_role_protected"] as const;
export type AuditReasonCode = (typeof AUDIT_REASON_CODES)[number];

export interface AuditReason {
  reasonCode: AuditReasonCode;
  outcome: "denied";
}

/** The `data.code` of each recordable answer, by status. A `403 forbidden` is the permission guard's own answer. */
const DENIED: Record<number, Record<string, AuditReasonCode>> = {
  403: { forbidden: "missing_permission", own_account: "own_account", super_required: "super_required" },
  409: { default_admin_protected: "default_admin_protected", super_role_protected: "super_role_protected" },
};

/** What to record for an API answer, or null when it is not an audit event. */
export function auditReasonOf(statusCode: number, code: string | undefined): AuditReason | null {
  if (!code) return null;
  const reasonCode = DENIED[statusCode]?.[code];
  return reasonCode ? { reasonCode, outcome: "denied" } : null;
}
