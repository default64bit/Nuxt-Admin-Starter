import pg from "pg";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { isMemoryStorage } from "../../utils/object-storage";
import { isStorageConfigured } from "../../utils/runtime-config-schema";
import { writeLog } from "../../utils/logger";

const { Client } = pg;

type Config = ReturnType<typeof useRuntimeConfig>;

async function checkDatabase(databaseUrl: string) {
  const database = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000, application_name: "nuxt-admin-starter-readiness" });
  try {
    await database.connect();
    await database.query("SELECT 1");
  } finally {
    await database.end().catch(() => undefined);
  }
}

async function checkStorage(s3: Config["s3"]) {
  const storage = new S3Client({
    endpoint: s3.endpoint,
    region: s3.region || "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
  });
  try {
    await storage.send(new HeadBucketCommand({ Bucket: s3.privateBucket }));
    await storage.send(new HeadBucketCommand({ Bucket: s3.publicBucket }));
  } finally {
    storage.destroy();
  }
}

// Readiness answers what the app needs to serve traffic (ADR-0015): PostgreSQL, plus private storage when it is
// configured. Storage that is not configured is skipped, and an error-tracking outage never makes the app unready.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  const config = useRuntimeConfig(event);

  try {
    if (!config.databaseUrl) throw new Error("database is not configured");
    await checkDatabase(config.databaseUrl);
    if (isStorageConfigured(config.s3) && !isMemoryStorage(config.s3)) await checkStorage(config.s3);
    return { status: "ready" as const };
  } catch (error) {
    // The body stays generic: no endpoints, credentials or database details on a public health route.
    writeLog("warn", "readiness check failed", { error: error instanceof Error ? error.message : "unknown error" }, event.context.requestId as string | undefined);
    throw createError({ statusCode: 503, statusMessage: "Service not ready" });
  }
});
