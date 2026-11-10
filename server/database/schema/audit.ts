import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, uuidPk } from "./_helpers";
import { auditOutcomeEnum } from "./enums";
import { users } from "./identity";

// Append-only: UPDATE, DELETE and TRUNCATE are rejected by triggers (hand-written block at the end of the baseline
// migration). No automatic expiry in v1.
// `changeSummary` must be a safe, redacted summary: never one-time codes, secrets or tokens.
export const adminAuditEvents = pgTable(
  "admin_audit_events",
  {
    id: uuidPk(),
    actorUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    outcome: auditOutcomeEnum().notNull(),
    changeSummary: jsonb(),
    reason: text(),
    correlationId: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("admin_audit_events_time_idx").on(t.createdAt.desc()),
    index("admin_audit_events_entity_idx").on(t.entityType, t.entityId, t.createdAt.desc()),
    index("admin_audit_events_actor_idx").on(t.actorUserId, t.createdAt.desc()),
    check("admin_audit_events_action_not_blank", sql`btrim(${t.action}) <> ''`),
  ],
);
