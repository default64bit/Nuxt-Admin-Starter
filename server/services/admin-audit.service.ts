import type { Db, Executor } from "../database/types";
import type { AuditReasonCode } from "../../shared/constants/audit-reasons";
import { countRecentAttempts, hasAttemptMarker, hasRecentAttempt, insertAuditEvent } from "../repositories/admin-audit.repository";
import { writeLog } from "../utils/logger";

export interface AuditEntry {
  /** Stable action key from `shared/constants/audit-actions.ts`, e.g. `user.disable`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** `{ old, new }` pairs, `{ added, removed }` lists or plain values; never secrets, one-time codes or tokens. */
  changeSummary?: Record<string, unknown>;
  reason?: string;
}

export interface AuditContext {
  /** Who acted; null for the system. */
  actorUserId: string | null;
  /** The request id, so an audit event can be matched to the structured logs. */
  correlationId?: string | undefined;
}

/**
 * Writes a `success` event in the caller's transaction (.specs/audit-log/spec.md "Events are written with the change"):
 * services call this inside the `db.transaction` that makes the mutation, so if either fails neither is committed and
 * there is never an unaudited admin mutation. Handlers never touch the audit table.
 */
export async function recordAudit(tx: Executor, context: AuditContext, entry: AuditEntry): Promise<void> {
  await insertAuditEvent(tx, {
    actorUserId: context.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    outcome: "success",
    changeSummary: entry.changeSummary ?? null,
    reason: entry.reason ?? null,
    correlationId: context.correlationId ?? null,
  });
}

/** The same refusal by the same User is written once per window; the log shows the first attempt of a burst. */
export const ATTEMPT_DEDUPE_MS = 15 * 60 * 1000;
/** At most this many `denied`/`failed` events are recorded per User in any rolling window; then one marker, then nothing. */
export const ATTEMPT_CAP = 20;
export const ATTEMPT_CAP_WINDOW_HOURS = 24;
export const ATTEMPT_CAP_WINDOW_MS = ATTEMPT_CAP_WINDOW_HOURS * 60 * 60 * 1000;
/** The single event that says further refusals in the window are not being written. */
export const ATTEMPT_MARKER_ACTION = "audit.attempts_suppressed";

/** The recording runs after the answer is decided and must never hold it up for long. */
export const ATTEMPT_WRITE_TIMEOUT_MS = 2000;

/** A refused attempt, as the error handler knows it: only closed values, never a body, query, header or the Permissions held. */
export interface AdminAttempt {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: "denied" | "failed";
  reasonCode: AuditReasonCode;
  method: string;
  /** The registry pattern, not the concrete URL. */
  route: string;
  correlationId?: string;
}

export interface AttemptDeps {
  db: Db;
  now?: () => Date;
  timeoutMs?: number;
  log?: (level: "warn" | "error", message: string, fields: Record<string, unknown>) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The route's `:id` exactly as sent, but only if it is a well-formed uuid: never looked up, never a free string. */
export const entityIdFromRoute = (raw: string | undefined): string | null => (raw !== undefined && UUID.test(raw) ? raw : null);

type Written = "written" | "deduplicated" | "suppressed";

async function writeAttempt(db: Db, attempt: AdminAttempt, since: Date, windowStart: Date): Promise<Written> {
  return db.transaction(async (tx): Promise<Written> => {
    const duplicate = await hasRecentAttempt(tx, { actorUserId: attempt.actorUserId, action: attempt.action, entityId: attempt.entityId, outcome: attempt.outcome, reasonCode: attempt.reasonCode }, since);
    if (duplicate) return "deduplicated";
    // Per-actor cap: past it, one marker per window and then nothing. Nothing is ever updated or counted up.
    if ((await countRecentAttempts(tx, attempt.actorUserId, windowStart, ATTEMPT_MARKER_ACTION)) >= ATTEMPT_CAP) {
      if (!(await hasAttemptMarker(tx, attempt.actorUserId, windowStart, ATTEMPT_MARKER_ACTION))) {
        await insertAuditEvent(tx, {
          actorUserId: attempt.actorUserId,
          action: ATTEMPT_MARKER_ACTION,
          entityType: "audit_log",
          entityId: null,
          outcome: "denied",
          changeSummary: { windowHours: ATTEMPT_CAP_WINDOW_HOURS, cap: ATTEMPT_CAP },
          correlationId: attempt.correlationId ?? null,
        });
      }
      return "suppressed";
    }
    await insertAuditEvent(tx, {
      actorUserId: attempt.actorUserId,
      action: attempt.action,
      entityType: attempt.entityType,
      entityId: attempt.entityId,
      outcome: attempt.outcome,
      changeSummary: { reasonCode: attempt.reasonCode, method: attempt.method, route: attempt.route },
      correlationId: attempt.correlationId ?? null,
    });
    return "written";
  });
}

/**
 * Best-effort record of a refused admin attempt (.specs/audit-log/spec.md "Refused attempts are recorded safely"). It
 * runs after the refusal was decided, on its own short transaction bounded by a timeout, and never throws: a write
 * that errors or times out leaves one `audit_write_failed` line and the response unchanged; a skipped attempt leaves
 * `admin_attempt_not_recorded`. Nothing is retried or queued.
 */
export async function recordAdminAttempt(deps: AttemptDeps, attempt: AdminAttempt): Promise<Written | "failed"> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((level, message, fields) => writeLog(level, message, fields, attempt.correlationId));
  const fields = { outcome: attempt.outcome, action: attempt.action, reasonCode: attempt.reasonCode, actorId: attempt.actorUserId };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("audit write timed out"), { name: "AuditWriteTimeout" })), deps.timeoutMs ?? ATTEMPT_WRITE_TIMEOUT_MS);
    });
    const result = await Promise.race([writeAttempt(deps.db, attempt, new Date(now().getTime() - ATTEMPT_DEDUPE_MS), new Date(now().getTime() - ATTEMPT_CAP_WINDOW_MS)), timeout]);
    // A skipped write is never silent: the first attempt of a burst is in the log, and so is every one skipped after it.
    if (result === "deduplicated" || result === "suppressed") log("warn", "admin_attempt_not_recorded", { ...fields, requestId: attempt.correlationId, skipped: result === "deduplicated" ? "duplicate" : "cap" });
    return result;
  } catch (error) {
    log("error", "audit_write_failed", { ...fields, requestId: attempt.correlationId, errorClass: error instanceof Error ? error.name : "unknown" });
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}
