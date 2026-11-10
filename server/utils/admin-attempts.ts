import type { H3Event } from "h3";
import { findAdminOperation } from "../../shared/constants/admin-operations";
import { auditReasonOf } from "../../shared/constants/audit-reasons";
import { entityIdFromRoute, recordAdminAttempt, type AdminAttempt } from "../services/admin-audit.service";
import type { ApiErrorBody } from "./api-error";
import { useDb } from "./db";
import type { AdminAttemptContext } from "./require-auth";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface RefusedRequest {
  method: string;
  /** The request path; a query string is cut off and never read. */
  path: string;
  /** The guard's stash: set only for a valid session. */
  admin: AdminAttemptContext | undefined;
  requestId?: string;
}

/**
 * The audit event a refused admin request should leave, or null when it leaves none: not a signed-in User, not a
 * mutating admin route, not a recordable answer. It reads only the method, the matched route pattern, the route's `:id`
 * shape, the guard's stash and the closed answer code; never the body, query or headers, and it looks nothing up.
 */
export function attemptFromRefusal(request: RefusedRequest, body: Pick<ApiErrorBody, "statusCode" | "data">): AdminAttempt | null {
  if (!request.admin || !MUTATING.has(request.method)) return null;
  const reason = auditReasonOf(body.statusCode, body.data.code);
  if (!reason) return null;
  const matched = findAdminOperation(request.method, request.path.split("?")[0] ?? "");
  if (!matched) return null;
  const { operation, params, route } = matched;
  return {
    actorUserId: request.admin.userId,
    action: operation.action,
    entityType: operation.entityType,
    entityId: entityIdFromRoute(operation.idParam ? params[operation.idParam] : undefined),
    outcome: reason.outcome,
    reasonCode: reason.reasonCode,
    method: request.method,
    route,
    ...(request.requestId ? { correlationId: request.requestId } : {}),
  };
}

/**
 * Called by the API error handler once an answer is decided: records a `denied` event when a signed-in User was refused
 * on a mutating admin route for a recordable reason. It never throws and never changes the answer.
 */
export async function recordRefusedAdminAttempt(event: H3Event, body: ApiErrorBody): Promise<void> {
  const context = event.context as { adminAttempt?: AdminAttemptContext; requestId?: string };
  const attempt = attemptFromRefusal({ method: event.method, path: event.path, admin: context.adminAttempt, ...(context.requestId ? { requestId: context.requestId } : {}) }, body);
  if (attempt) await recordAdminAttempt({ db: useDb() }, attempt);
}
