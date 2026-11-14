import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../database/schema";
import { collectGarbage } from "../services/media-gc.service";
import { createS3Storage } from "../utils/object-storage";

// One-shot media cleanup (.specs/media/spec.md): `just media-gc` runs it in the `media-gc` Compose job.
// It deletes uploads nobody attached and images that were replaced or removed, once they are older
// than the grace period, and never an object that a record
// references (MEDIA_OWNER_TABLES). Safe to repeat. Scheduling it (cron, a systemd timer) is an operations choice; the app
// never runs it by itself.
//
//   --older-than-hours=N   grace period (default 24)
//   --dry-run              report what would be deleted, delete nothing
const log = (line: Record<string, unknown>) => console.log(JSON.stringify({ time: new Date().toISOString(), service: "media-gc", ...line }));

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
const databaseUrl = process.env.DATABASE_URL || process.env.NUXT_DATABASE_URL;
const s3 = {
  endpoint: process.env.NUXT_S3_ENDPOINT,
  region: process.env.NUXT_S3_REGION || "us-east-1",
  accessKey: process.env.NUXT_S3_ACCESS_KEY,
  secretKey: process.env.NUXT_S3_SECRET_KEY,
  privateBucket: process.env.NUXT_S3_PRIVATE_BUCKET,
  publicBucket: process.env.NUXT_S3_PUBLIC_BUCKET,
};
const variables: Record<string, string> = { endpoint: "NUXT_S3_ENDPOINT", accessKey: "NUXT_S3_ACCESS_KEY", secretKey: "NUXT_S3_SECRET_KEY", privateBucket: "NUXT_S3_PRIVATE_BUCKET", publicBucket: "NUXT_S3_PUBLIC_BUCKET" };
const missing = [!databaseUrl && "DATABASE_URL", ...Object.entries(variables).filter(([key]) => !s3[key as keyof typeof s3]).map(([, name]) => name)].filter(Boolean);
if (missing.length > 0) {
  log({ level: "error", event: "config_error", message: `missing configuration: ${missing.join(", ")}` });
  process.exit(1);
}

const olderThanHours = arg("older-than-hours") === undefined ? undefined : Number(arg("older-than-hours"));
if (olderThanHours !== undefined && (!Number.isFinite(olderThanHours) || olderThanHours < 0)) {
  log({ level: "error", event: "config_error", message: "--older-than-hours must be a number of hours" });
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
try {
  const summary = await collectGarbage(
    { db: drizzle(pool, { schema, casing: "snake_case" }), storage: createS3Storage(s3 as Parameters<typeof createS3Storage>[0]) },
    { olderThanHours, dryRun: process.argv.includes("--dry-run"), log: (event) => log({ level: "info", ...event }) },
  );
  log({ level: summary.storageFailures > 0 ? "warn" : "info", event: "summary", ...summary });
  // A stored object that could not be removed is reported through the exit code so an operator notices.
  process.exitCode = summary.storageFailures > 0 ? 1 : 0;
} catch (error) {
  log({ level: "error", event: "failed", message: error instanceof Error ? error.message : "media cleanup failed" });
  process.exitCode = 1;
} finally {
  await pool.end();
}
