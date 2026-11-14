import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { runSeeds } from "./seeds";
import * as schema from "./schema";

// CLI entry (`pnpm db:seed`): reconciles the Permission catalogue and applies any seed versions that have not completed.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run seeds.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, application_name: "nuxt-admin-starter-seed" });
try {
  const report = await runSeeds(drizzle(pool, { schema, casing: "snake_case" }), {
    DEFAULT_ADMIN_PHONE: process.env.DEFAULT_ADMIN_PHONE,
    DEFAULT_ADMIN_GIVEN_NAME: process.env.DEFAULT_ADMIN_GIVEN_NAME,
    DEFAULT_ADMIN_FAMILY_NAME: process.env.DEFAULT_ADMIN_FAMILY_NAME,
  });
  for (const version of report.applied) console.log(`Seed ${version}: applied.`);
  for (const version of report.skipped) console.log(`Seed ${version}: already applied; skipped.`);
  for (const warning of report.warnings) console.warn(`WARNING: ${warning}`);
  console.log("Seeding complete.");
} catch (error) {
  console.error("Seeding failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
