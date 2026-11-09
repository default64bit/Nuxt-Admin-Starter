// Single source of truth for closed value sets that are persisted as PostgreSQL enums.
// The Drizzle schema (server/database/schema) builds `pgEnum`s from these tuples and
// zod schemas should reuse them, so the database and the API contracts cannot drift.
// Adding a value requires a reviewed migration (`ALTER TYPE ... ADD VALUE`). Each slice that adds
// an enum adds its tuple here and its `pgEnum` in `server/database/schema/enums.ts`.

// Identity
export const USER_STATUSES = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
