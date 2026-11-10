/**
 * Typed domain error thrown by services (ADR-0015). It carries the h3-compatible `statusCode`,
 * `statusMessage` and `data` fields, so `createError`/the API error handler turn it into the
 * standard body without services depending on h3.
 */
export interface DomainErrorData {
  code: string;
  retryAfter?: number;
  fieldErrors?: Record<string, string[]>;
  /** `permission_prerequisites`: the missing `{ key, needs }` pairs. */
  missing?: string[] | { key: string; needs: string }[];
  /** `phone_in_use`: the account that already has the phone. */
  userId?: string;
  /** `in_use` on a role: how many accounts hold it. */
  memberCount?: number;
  /** `stale_version` and `invalid_transition`: the record as it is now. */
  current?: Record<string, unknown>;
}

export class DomainError extends Error {
  readonly statusCode: number;
  readonly statusMessage: string;
  readonly data: DomainErrorData;

  constructor(
    statusCode: number,
    statusMessage: string,
    code: string,
    extra: Omit<DomainErrorData, "code"> = {},
  ) {
    super(code);
    this.name = "DomainError";
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.data = { code, ...extra };
  }
}

export const tooManyRequests = (code: string, retryAfter: number) =>
  new DomainError(429, "Too Many Requests", code, { retryAfter });

export const serviceUnavailable = (code: string) => new DomainError(503, "Service Unavailable", code);

export const validationFailed = (fieldErrors: Record<string, string[]>) => new DomainError(400, "Bad Request", "validation_failed", { fieldErrors });

// Generic business errors shared by every domain.
/** A record other records still depend on; `memberCount` says how many accounts hold a role that cannot be deleted. */
export const inUse = (memberCount?: number) => new DomainError(409, "Conflict", "in_use", memberCount === undefined ? {} : { memberCount });
export const duplicateName = (field: string) => new DomainError(409, "Conflict", "duplicate_name", { fieldErrors: { [field]: ["duplicate_name"] } });
/** `current` names where the record is now (a ticket's `{ status }`) when a second actor lost the race. */
export const invalidTransition = (current?: Record<string, unknown>) => new DomainError(409, "Conflict", "invalid_transition", current ? { current } : {});
export const staleVersion = (current: Record<string, unknown>) => new DomainError(409, "Conflict", "stale_version", { current });
export const idempotencyConflict = () => new DomainError(409, "Conflict", "idempotency_conflict");

// Business errors of accounts and roles.
export const superRoleProtected = () => new DomainError(409, "Conflict", "super_role_protected");
export const permissionPrerequisites = (missing: { key: string; needs: string }[]) => new DomainError(422, "Unprocessable Entity", "permission_prerequisites", { missing });
export const ownAccount = () => new DomainError(403, "Forbidden", "own_account");
export const superRequired = () => new DomainError(403, "Forbidden", "super_required");
export const phoneInUse = (userId: string) => new DomainError(409, "Conflict", "phone_in_use", { userId, fieldErrors: { phone: ["phone_in_use"] } });
export const lastRole = () => new DomainError(422, "Unprocessable Entity", "last_role");
export const accountDisabled = () => new DomainError(409, "Conflict", "account_disabled");
/** The Default admin is never disabled and never loses `super`. */
export const defaultAdminProtected = () => new DomainError(409, "Conflict", "default_admin_protected");
