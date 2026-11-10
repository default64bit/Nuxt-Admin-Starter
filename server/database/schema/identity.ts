import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt, uuidPk } from "./_helpers";
import { otpPurposeEnum, userStatusEnum } from "./enums";

// There is one kind of account. Accounts are never deleted; `disabled` is the only deactivation. Every User holds
// at least one Role, so there is deliberately no is_admin column.
export const users = pgTable(
  "users",
  {
    id: uuidPk(),
    phoneE164: text("phone_e164").notNull(),
    phoneVerifiedAt: timestamptz(),
    givenName: text(),
    familyName: text(),
    status: userStatusEnum().notNull().default("active"),
    isDefaultAdmin: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_phone_e164_unique").on(t.phoneE164),
    // The Users list: newest accounts first, then id.
    index("users_created_idx").on(t.createdAt.desc(), t.id.desc()),
    // Exactly one Default admin.
    uniqueIndex("users_single_default_admin_unique")
      .on(t.isDefaultAdmin)
      .where(sql`${t.isDefaultAdmin}`),
    // The Starter default is an Iranian mobile number; a Project serving another country changes this CHECK.
    check("users_phone_e164_format", sql`${t.phoneE164} ~ '^\\+989[0-9]{9}$'`),
    check("users_default_admin_never_disabled", sql`NOT (${t.isDefaultAdmin} AND ${t.status} = 'disabled')`),
  ],
);

// Server-side session registry. The cookie carries an opaque token; only its SHA-256 hash is stored.
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuidPk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tokenHash: text().notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamptz().notNull().defaultNow(),
    idleExpiresAt: timestamptz().notNull(),
    absoluteExpiresAt: timestamptz().notNull(),
    revokedAt: timestamptz(),
    revokedReason: text(),
    userAgent: text(),
  },
  (t) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(t.tokenHash),
    index("auth_sessions_user_idx").on(t.userId),
    check("auth_sessions_expiry_order", sql`${t.absoluteExpiresAt} > ${t.createdAt}`),
  ],
);

// One active challenge per (phone, purpose). The plaintext code is the accepted exception (ADR-0010) and MUST be
// NULL once the challenge is consumed or invalidated. Never log or copy it elsewhere.
export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: uuidPk(),
    phoneE164: text("phone_e164").notNull(),
    purpose: otpPurposeEnum().notNull(),
    // Set only for an authenticated purpose (a phone change); sign-in leaves it NULL.
    userId: uuid().references(() => users.id, { onDelete: "restrict" }),
    code: text(),
    issuedAt: createdAt(),
    expiresAt: timestamptz().notNull(),
    lastSentAt: timestamptz().notNull().defaultNow(),
    attemptCount: integer().notNull().default(0),
    consumedAt: timestamptz(),
    invalidatedAt: timestamptz(),
  },
  (t) => [
    uniqueIndex("otp_challenges_one_active_unique")
      .on(t.phoneE164, t.purpose)
      .where(sql`${t.consumedAt} IS NULL AND ${t.invalidatedAt} IS NULL`),
    check("otp_challenges_phone_format", sql`${t.phoneE164} ~ '^\\+989[0-9]{9}$'`),
    check("otp_challenges_code_format", sql`${t.code} IS NULL OR ${t.code} ~ '^[0-9]{5}$'`),
    check("otp_challenges_code_cleared_when_closed", sql`(${t.consumedAt} IS NULL AND ${t.invalidatedAt} IS NULL) OR ${t.code} IS NULL`),
    check("otp_challenges_attempts_range", sql`${t.attemptCount} BETWEEN 0 AND 10`),
    check("otp_challenges_expiry_order", sql`${t.expiresAt} > ${t.issuedAt}`),
  ],
);

// One row per actual SMS send, used for the rolling per-phone and per-IP limits. Only an HMAC of the IP is stored.
// `userId` is set only for authenticated sends; sign-in sends leave it NULL. Rows older than 24 hours are purged.
export const otpSendEvents = pgTable(
  "otp_send_events",
  {
    id: uuidPk(),
    phoneE164: text("phone_e164").notNull(),
    ipHash: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "restrict" }),
    sentAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("otp_send_events_phone_sent_idx").on(t.phoneE164, t.sentAt),
    index("otp_send_events_ip_sent_idx").on(t.ipHash, t.sentAt),
    index("otp_send_events_user_sent_idx").on(t.userId, t.sentAt),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuidPk(),
    name: text().notNull(),
    isSuper: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("roles_name_unique").on(t.name),
    // Role names are unique ignoring case and surrounding spaces.
    uniqueIndex("roles_name_normalized_unique").on(sql`lower(btrim(${t.name}))`),
    uniqueIndex("roles_single_super_unique")
      .on(t.isSuper)
      .where(sql`${t.isSuper}`),
  ],
);

// Code-defined, seeded Permission keys (e.g. `manage-roles`). Never created through the panel.
export const permissions = pgTable("permissions", {
  key: text().primaryKey(),
  createdAt: createdAt(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text()
      .notNull()
      .references(() => permissions.key, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    assignedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    assignedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index("user_roles_role_idx").on(t.roleId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
