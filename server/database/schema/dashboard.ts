import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz, updatedAt } from "./_helpers";
import { users } from "./identity";

// One row per User (`.specs/admin-dashboard/spec.md` "Layout storage"). A missing row means every
// default applies; a null `arrangement` means the computed default. Layout, range and Chart style changes are
// personal preferences: not audited and never purged (accounts are never deleted).
export const dashboardPreferences = pgTable(
  "dashboard_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    /** `{ version: 1, modules: [{ key, width, fill }] }`, or null for the computed default. */
    arrangement: jsonb(),
    /** The chosen range per module key; a module without ranges never appears. */
    ranges: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    chartStyle: text().notNull().default("soft"),
    /** The version used for the Save conflict check; a range change never touches it. */
    arrangementUpdatedAt: timestamptz(),
    updatedAt: updatedAt(),
  },
  (t) => [check("dashboard_preferences_chart_style", sql`${t.chartStyle} IN ('soft', 'glow', 'pro')`)],
);

export type DashboardPreferencesRow = typeof dashboardPreferences.$inferSelect;
