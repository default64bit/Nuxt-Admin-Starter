#!/usr/bin/env node
// Runs the Playwright suite as N isolated shards in parallel.
//
// The suite cannot simply use several Playwright workers: every spec shares one database and fixed phone numbers.
// So each shard gets its own copy of everything stateful:
//   - its own PostgreSQL database, cloned from one freshly migrated template database that has the production
//     seed only (Permissions, the `super` Role, the Default admin); the dev seed never reaches a test database,
//   - its own app server on its own port (and its own build directory),
//   - its own Playwright process running `--shard=i/N` (files stay serial inside a shard).
// Nothing here touches the developer's database (`DATABASE_URL`'s database) or the Compose `app` service.
//
//   node scripts/e2e/sharded.mjs [--shards 3] [--server build|dev] [--keep] [--hold] [-- <playwright args>]
//
// `--hold` prepares the databases and servers, prints how to point Playwright at shard 1 and waits for Ctrl-C (for
// iterating on one spec without rebuilding).
//
// A failing test is retried once (`--retries=1`, as in CI); one that passes on the retry is reported as flaky, not hidden.
// Pass `--retries=0` after `--` to turn that off.
//
// `build` (default) builds the app once and serves it from N production servers: faster, and it does not suffer a
// cold dev server re-optimizing dependencies in the middle of a flow. `dev` starts N `nuxt dev` servers instead.
//
// Needs DATABASE_URL (the app role) and DATABASE_ADMIN_URL (maintenance role that may create databases), as in .env.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

const argv = process.argv.slice(2);
const split = argv.indexOf("--");
const own = split === -1 ? argv : argv.slice(0, split);
const passthrough = split === -1 ? [] : argv.slice(split + 1);
const option = (name, fallback) => {
  const at = own.indexOf(`--${name}`);
  return at === -1 ? fallback : own[at + 1];
};
const SHARDS = Number(option("shards", process.env.E2E_SHARDS ?? 3));
const MODE = option("server", process.env.E2E_SERVER ?? "build");
const KEEP = own.includes("--keep");
const HOLD = own.includes("--hold");
const BASE_PORT = Number(process.env.E2E_SHARD_BASE_PORT ?? 3200);
const TEMPLATE = "nas_e2e_template";
const shardDb = (i) => `nas_e2e_shard_${i}`;

if (!Number.isInteger(SHARDS) || SHARDS < 1 || !["dev", "build"].includes(MODE)) {
  console.error("Usage: sharded.mjs [--shards N>=1] [--server build|dev] [--keep] [-- playwright args]");
  process.exit(2);
}
const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!appUrl || !adminUrl) {
  console.error("DATABASE_URL and DATABASE_ADMIN_URL are required (see .env.example).");
  process.exit(2);
}
const appRole = decodeURIComponent(new URL(appUrl).username);
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const urlFor = (name) => {
  const url = new URL(appUrl);
  url.pathname = `/${name}`;
  return url.toString();
};
const log = (message) => console.log(`[e2e-shards] ${message}`);

async function admin(fn) {
  const client = new pg.Client({ connectionString: adminUrl, application_name: "nuxt-admin-starter-e2e-shards" });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
const dropDb = (client, name) =>
  client
    .query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name])
    .then(() => client.query(`DROP DATABASE IF EXISTS ${quote(name)}`));

function runSync(command, args, env) {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

const children = [];
let cleaningUp = false;
async function cleanup() {
  if (cleaningUp) return;
  cleaningUp = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    try {
      process.kill(-child.pid, "SIGTERM"); // the whole group: `pnpm exec` starts the real process as a grandchild
    } catch {
      child.kill("SIGTERM");
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (KEEP) return log("--keep: the shard databases are left in place");
  await admin(async (client) => {
    for (let i = 1; i <= SHARDS; i++) await dropDb(client, shardDb(i));
    await dropDb(client, TEMPLATE);
  }).catch((error) => console.error("cleanup failed:", error.message));
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => cleanup().finally(() => process.exit(130)));
}

async function prepareDatabases() {
  log(`creating the template database (migrate + seed), then ${SHARDS} shard database(s)`);
  await admin(async (client) => {
    for (let i = 1; i <= SHARDS; i++) await dropDb(client, shardDb(i));
    await dropDb(client, TEMPLATE);
    await client.query(`CREATE DATABASE ${quote(TEMPLATE)} OWNER ${quote(appRole)}`);
  });
  const env = { DATABASE_URL: urlFor(TEMPLATE), NUXT_DATABASE_URL: urlFor(TEMPLATE) };
  runSync("pnpm", ["exec", "drizzle-kit", "migrate"], env);
  // The production seed creates the Default admin from these; specs that need an account make their own.
  runSync("pnpm", ["db:seed"], { ...env, DEFAULT_ADMIN_PHONE: DEFAULT_ADMIN_PHONE, DEFAULT_ADMIN_GIVEN_NAME: "E2E", DEFAULT_ADMIN_FAMILY_NAME: "Admin" });
  await admin(async (client) => {
    // CREATE DATABASE ... TEMPLATE needs the template to have no other connections.
    await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", [TEMPLATE]);
    for (let i = 1; i <= SHARDS; i++) await client.query(`CREATE DATABASE ${quote(shardDb(i))} TEMPLATE ${quote(TEMPLATE)} OWNER ${quote(appRole)}`);
  });
}

const DEFAULT_ADMIN_PHONE = process.env.E2E_DEFAULT_ADMIN_PHONE ?? "09120000000";

const portOf = (i) => BASE_PORT + i;
const originOf = (i) => `http://127.0.0.1:${portOf(i)}`;
const serverEnv = (i) => ({
  DATABASE_URL: urlFor(shardDb(i)),
  NUXT_DATABASE_URL: urlFor(shardDb(i)),
  NUXT_SMS_PROVIDER: "mock",
  NUXT_APP_ENV: "local",
  NUXT_SESSION_PASSWORD: process.env.NUXT_SESSION_PASSWORD || "e2e-session-password-0123456789abcdef",
  NUXT_IP_HASH_SECRET: process.env.NUXT_IP_HASH_SECRET || "e2e-ip-hash-secret-0123456789abcdef",
  NUXT_PUBLIC_SITE_URL: originOf(i),
  // Media storage on the in-process fake store (`memory:`), so the media e2e needs no RustFS. Placeholder keys only.
  NUXT_S3_ENDPOINT: "memory:",
  NUXT_S3_ACCESS_KEY: "e2e-access",
  NUXT_S3_SECRET_KEY: "e2e-secret-key",
  NUXT_S3_PRIVATE_BUCKET: "e2e-private",
  NUXT_S3_PUBLIC_BUCKET: "e2e-public",
  E2E_BUILD_DIR: `.nuxt-e2e-shard-${i}`,
  // A dev server watches a lot of files; on a machine near its inotify limit polling avoids ENOSPC.
  ...(process.env.E2E_POLLING === "1" ? { CHOKIDAR_USEPOLLING: "1", CHOKIDAR_INTERVAL: "2000" } : {}),
});

function prefixed(stream, tag) {
  let rest = "";
  stream.on("data", (chunk) => {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) console.log(`${tag} ${line}`);
  });
}

function startServer(i) {
  const env = { ...process.env, ...serverEnv(i) };
  const child =
    MODE === "dev"
      ? spawn("pnpm", ["exec", "nuxt", "dev", "--host", "127.0.0.1", "--port", String(portOf(i))], { env, stdio: ["ignore", "pipe", "pipe"], detached: true })
      : spawn("node", [".nuxt-e2e-shard-1/output/server/index.mjs"], { env: { ...env, HOST: "127.0.0.1", PORT: String(portOf(i)), NITRO_HOST: "127.0.0.1", NITRO_PORT: String(portOf(i)) }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  children.push(child);
  // Server noise stays out of the way unless the server dies.
  const tail = [];
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => (tail.push(String(chunk)), tail.length > 40 && tail.shift()));
  child.on("exit", (code) => {
    if (!cleaningUp && code) console.error(`[shard ${i}] server exited with ${code}\n${tail.join("")}`);
  });
  return child;
}

async function waitFor(i, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${originOf(i)}/api/health/live`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`shard ${i}: the server did not become healthy on ${originOf(i)}`);
}

function runShard(i) {
  mkdirSync(`test-results/shard-${i}`, { recursive: true });
  const args = ["exec", "playwright", "test", `--shard=${i}/${SHARDS}`, `--output=test-results/shard-${i}`, "--reporter=line,html", "--pass-with-no-tests", "--retries=1", ...passthrough];
  const child = spawn("pnpm", args, { env: { ...process.env, ...serverEnv(i), PLAYWRIGHT_BASE_URL: originOf(i), PLAYWRIGHT_HTML_REPORT: `playwright-report/shard-${i}`, PLAYWRIGHT_HTML_OPEN: "never" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  children.push(child);
  const lines = [];
  const tag = `[shard ${i}/${SHARDS}]`;
  for (const stream of [child.stdout, child.stderr]) {
    prefixed(stream, tag);
    stream.on("data", (chunk) => lines.push(String(chunk)));
  }
  return new Promise((resolve) => child.on("exit", (code) => resolve({ shard: i, code: code ?? 1, output: lines.join("") })));
}

const started = Date.now();
let exitCode = 1;
try {
  await prepareDatabases();
  if (MODE === "build") {
    log("building the app once");
    runSync("pnpm", ["exec", "nuxt", "build"], { ...serverEnv(1), E2E_BUILD_DIR: ".nuxt-e2e-shard-1" });
    // One build serves every shard: the servers differ only by environment (database, port, site URL).
  }
  log(`starting ${SHARDS} ${MODE} server(s) on ports ${portOf(1)}..${portOf(SHARDS)}`);
  for (let i = 1; i <= SHARDS; i++) startServer(i);
  await Promise.all(Array.from({ length: SHARDS }, (_, k) => waitFor(k + 1)));
  if (HOLD) {
    log(`servers are up. For shard 1: DATABASE_URL=${urlFor(shardDb(1))} PLAYWRIGHT_BASE_URL=${originOf(1)} pnpm exec playwright test <spec>`);
    await new Promise(() => {});
  }
  log("servers are up; running the shards");
  const results = await Promise.all(Array.from({ length: SHARDS }, (_, k) => runShard(k + 1)));
  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(`\n[e2e-shards] finished in ${minutes} min`);
  for (const { shard, code, output } of results) {
    const summary = output.split("\n").filter((line) => /^\s+\d+ (passed|failed|skipped|flaky|did not run)/.test(line)).map((line) => line.trim()).join(", ");
    console.log(`  shard ${shard}: ${code === 0 ? "ok" : `FAILED (exit ${code})`} ${summary}`);
    if (code !== 0) for (const line of output.split("\n").filter((l) => /^\s+\d+\) \[/.test(l))) console.log(`    ${line.trim()}`);
    // The names Playwright lists under "N flaky" (failed, then passed on the retry).
    const rows = output.split("\n");
    const at = rows.findIndex((l) => /^\s+\d+ flaky/.test(l));
    if (at !== -1) {
      for (const line of rows.slice(at + 1).filter((l, k) => k < 40 && /^\s+\[(chromium|firefox|webkit)\]/.test(l))) {
        console.log(`    flaky: ${line.trim()}`);
        // Passed only on the retry: surfaced on the run page instead of hidden.
        if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Flaky e2e test::${line.trim()}`);
      }
    }
  }
  exitCode = results.every((r) => r.code === 0) ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  await cleanup();
}
process.exit(exitCode);
