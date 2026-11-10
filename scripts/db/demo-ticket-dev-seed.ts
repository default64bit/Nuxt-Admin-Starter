// demo-ticket:start (whole file) -- CLI of the dev seed (`just db-seed-dev`); `just demo-remove` deletes this file.
// It refuses to run unless NUXT_APP_ENV is `local`, so it never touches a production or test database.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../server/database/schema";
import { DEV_USERS, seedDemoTicketDevData } from "../../server/database/demo-ticket-dev-seed";

if (process.env.NUXT_APP_ENV !== "local") {
  console.error("Refusing to seed dev data: NUXT_APP_ENV must be `local`. The dev seed never runs against production or test databases.");
  process.exit(1);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run the dev seed.");
  process.exit(1);
}
const pool = new Pool({ connectionString: databaseUrl, application_name: "nuxt-admin-starter-dev-seed" });
try {
  const added = await drizzle(pool, { schema, casing: "snake_case" }).transaction((tx) => seedDemoTicketDevData(tx));
  console.log(added > 0 ? `Dev seed: ${DEV_USERS.length} dev Users and ${added} demo tickets added.` : "Dev seed: demo tickets already exist; nothing added.");
} catch (error) {
  console.error("Dev seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
// demo-ticket:end
