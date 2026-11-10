import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { NOTIFICATION_CHANNEL_HEALTH_STATUSES } from "../../../shared/constants/database-enums";
import { createdAt, timestamptz, uuidPk } from "./_helpers";
import { localeEnum, notificationChannelEnum, outboxStatusEnum } from "./enums";
import { permissions, users } from "./identity";

// One Inbox item per source event. Visible (and sent to Channels) only to Users who currently hold `requiredPermission`,
// checked at read time; when `recipientUserId` is set, only to that User. `resolvedAt` is set when the underlying task
// ends; marking an item read never sets it.
export const notifications = pgTable(
  "notifications",
  {
    id: uuidPk(),
    type: text().notNull(),
    requiredPermission: text()
      .notNull()
      .references(() => permissions.key, { onDelete: "restrict" }),
    // Optional: when set, only this User sees the item.
    recipientUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    sourceEntityType: text().notNull(),
    sourceEntityId: text().notNull(),
    // At most three non-personal values (a priority, a count), stored raw: the Inbox and the Channels format them for
    // their reader's locale. Never free text a User typed.
    tokens: text().array(),
    dedupeKey: text().notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamptz(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_key_unique").on(t.dedupeKey),
    check("notifications_token_limit", sql`${t.tokens} IS NULL OR cardinality(${t.tokens}) <= 3`),
    index("notifications_unresolved_idx")
      .on(t.requiredPermission, t.createdAt.desc())
      .where(sql`${t.resolvedAt} IS NULL`),
    index("notifications_source_idx").on(t.sourceEntityType, t.sourceEntityId),
  ],
);

// Per-User read state. A missing row means unread for that User.
export const notificationReads = pgTable(
  "notification_reads",
  {
    notificationId: uuid()
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    readAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

// Transactional outbox: one row per (event, Channel, address), created in the same transaction as the business change.
// It carries a semantic event key, the recipient's Message language and at most three tokens; OTP codes never appear
// here. After the retention window the worker nulls `recipient` and `tokens` and sets `payloadPurgedAt`, keeping the
// idempotency metadata.
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuidPk(),
    dedupeKey: text().notNull(),
    channel: notificationChannelEnum().notNull(),
    eventKey: text().notNull(),
    locale: localeEnum(),
    recipient: text(),
    tokens: text().array(),
    sourceEntityType: text().notNull(),
    sourceEntityId: text().notNull(),
    notificationId: uuid().references(() => notifications.id, { onDelete: "restrict" }),
    status: outboxStatusEnum().notNull().default("queued"),
    attemptCount: smallint().notNull().default(0),
    nextAttemptAt: timestamptz().notNull().defaultNow(),
    leasedUntil: timestamptz(),
    leasedBy: text(),
    // Null only on a Channel's own subscription system messages, which have no Inbox item and no preference.
    recipientUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    deliveredAt: timestamptz(),
    terminalFailedAt: timestamptz(),
    skippedAt: timestamptz(),
    lastFailureCategory: text(),
    payloadPurgedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notification_outbox_dedupe_key_unique").on(t.dedupeKey),
    index("notification_outbox_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.status} IN ('queued', 'claimed')`),
    index("notification_outbox_retention_idx").on(t.status, t.deliveredAt, t.terminalFailedAt, t.skippedAt),
    index("notification_outbox_recipient_user_idx").on(t.recipientUserId),
    check("notification_outbox_attempts_range", sql`${t.attemptCount} BETWEEN 0 AND 5`),
    check("notification_outbox_token_limit", sql`${t.tokens} IS NULL OR cardinality(${t.tokens}) <= 3`),
    check(
      "notification_outbox_status_timestamps",
      sql`(${t.status} = 'delivered') = (${t.deliveredAt} IS NOT NULL)
        AND (${t.status} = 'failed') = (${t.terminalFailedAt} IS NOT NULL)
        AND (${t.status} = 'skipped') = (${t.skippedAt} IS NOT NULL)`,
    ),
  ],
);

// A User's choice per Channel. A missing row means on; the Inbox cannot be turned off.
export const notificationChannelPreferences = pgTable(
  "notification_channel_preferences",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    channel: notificationChannelEnum().notNull(),
    enabled: boolean().notNull(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channel] })],
);

// A User's own notification settings that are not per Channel: the Message language every Channel uses. A missing row
// means the default (`fa`). A preference: never audited.
export const notificationSettings = pgTable("notification_settings", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "restrict" }),
  messageLocale: localeEnum().notNull().default("fa"),
  updatedAt: timestamptz().notNull().defaultNow(),
});

// Circuit-breaker state of a Channel; a missing row means operational.
export const notificationChannelHealth = pgTable(
  "notification_channel_health",
  {
    channel: notificationChannelEnum().primaryKey(),
    status: text().notNull().default("operational"),
    since: timestamptz().notNull().defaultNow(),
    consecutiveFailures: integer().notNull().default(0),
    lastFailureCategory: text(),
    nextProbeAt: timestamptz(),
  },
  (t) => [
    check("notification_channel_health_status", sql`${t.status} IN (${sql.join(NOTIFICATION_CHANNEL_HEALTH_STATUSES.map((status) => sql.raw(`'${status}'`)), sql`, `)})`),
    check("notification_channel_health_failures_nonnegative", sql`${t.consecutiveFailures} >= 0`),
  ],
);
