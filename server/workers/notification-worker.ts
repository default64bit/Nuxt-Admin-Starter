import { randomUUID } from "node:crypto";
import { closeSync, openSync, utimesSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../database/schema";
import { createAdminChannelRegistry } from "../notifications/admin-channels";
import { runProbes } from "../notifications/channel-health";
import { processDue, purgeExpiredPayloads } from "../notifications/outbox";

// Notification outbox worker (a separate Compose process, ADR-0021). Delivers queued rows to the Channels after the
// business transaction committed; a transport failure never changes business state. With no Channel installed it has
// nothing to send and only keeps the outbox tidy.
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE || "/tmp/worker-heartbeat";
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2_000);
const PURGE_EVERY_MS = 60 * 60 * 1_000;

const log = (line: Record<string, unknown>) => console.log(JSON.stringify({ time: new Date().toISOString(), service: "notification-worker", ...line }));

function heartbeat() {
  const now = new Date();
  try {
    utimesSync(HEARTBEAT_FILE, now, now);
  } catch {
    closeSync(openSync(HEARTBEAT_FILE, "w"));
  }
}

const databaseUrl = process.env.DATABASE_URL || process.env.NUXT_DATABASE_URL;
if (!databaseUrl) {
  log({ level: "error", event: "config_error", message: "DATABASE_URL is required" });
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, application_name: "nuxt-admin-starter-notification-worker" });
const db = drizzle(pool, { schema, casing: "snake_case" });
const workerId = `worker-${randomUUID()}`;
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    log({ level: "info", event: "shutdown_requested", signal });
    stopping = true;
  });
}

// A missing Channel configuration is "not configured", never a boot failure.
const channels = createAdminChannelRegistry();
for (const channel of channels) {
  const state = channel.availability();
  if (state !== "operational") log({ level: "info", event: "admin_channel_unavailable", channel: channel.key, state });
}

log({ level: "info", event: "started", workerId });
let lastPurge = 0;
while (!stopping) {
  heartbeat();
  try {
    await runProbes(db, channels, log); // a degraded Channel is tried again every five minutes; nothing is replayed
    const summary = await processDue({ db, channels, workerId, log, siteUrl: process.env.NUXT_PUBLIC_SITE_URL }, 20);
    if (summary.claimed) log({ level: "info", event: "batch", ...summary });
    if (Date.now() - lastPurge > PURGE_EVERY_MS) {
      lastPurge = Date.now();
      const purged = await purgeExpiredPayloads(db);
      if (purged) log({ level: "info", event: "retention_purge", purged });
    }
  } catch (error) {
    log({ level: "error", event: "loop_error", message: error instanceof Error ? error.name : "error" });
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}
await pool.end();
log({ level: "info", event: "stopped" });
