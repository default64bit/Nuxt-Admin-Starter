import { pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers";

// Versioned, idempotent seed bookkeeping: a completed version is never re-run, so edits and deletions
// made through the panel survive later deploys.
export const seedVersions = pgTable("seed_versions", {
  version: text().primaryKey(),
  appliedAt: timestamptz().notNull().defaultNow(),
});
