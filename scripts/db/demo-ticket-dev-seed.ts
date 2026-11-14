// demo-ticket:start (whole file) -- CLI of the dev seed (`just db-seed-dev`); `just demo-remove` deletes this file.
// It refuses to run unless NUXT_APP_ENV is `local`, so it never touches a production or test database.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../server/database/schema";
import { createS3Storage } from "../../server/utils/object-storage";
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
// Media storage is an Optional piece: with the NUXT_S3_* settings the seed also stores placeholder images for about a
// quarter of the tickets; without them the tickets have none.
const s3 = {
  endpoint: process.env.NUXT_S3_ENDPOINT ?? "",
  region: process.env.NUXT_S3_REGION || "us-east-1",
  accessKey: process.env.NUXT_S3_ACCESS_KEY ?? "",
  secretKey: process.env.NUXT_S3_SECRET_KEY ?? "",
  privateBucket: process.env.NUXT_S3_PRIVATE_BUCKET ?? "",
  publicBucket: process.env.NUXT_S3_PUBLIC_BUCKET ?? "",
};
const storage = s3.endpoint && s3.accessKey && s3.secretKey && s3.publicBucket && s3.privateBucket ? createS3Storage(s3) : undefined;
if (!storage) console.log("Dev seed: media storage is not configured; the demo tickets get no images.");
const pool = new Pool({ connectionString: databaseUrl, application_name: "nuxt-admin-starter-dev-seed" });
try {
  const added = await drizzle(pool, { schema, casing: "snake_case" }).transaction((tx) => seedDemoTicketDevData(tx, new Date(), storage));
  console.log(added > 0 ? `Dev seed: ${DEV_USERS.length} dev Users and ${added} demo tickets added.` : "Dev seed: demo tickets already exist; nothing added.");
} catch (error) {
  console.error("Dev seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
// demo-ticket:end
