// @vitest-environment node
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Backups (Optional piece `backup`): a real dump of a real PostgreSQL goes through the real `backup` image to an
// S3-compatible stand-in, is listed by the last-success check, pruned by age and restored into a scratch database.
// Needs Docker, so it runs in the `deploy-automation` CI job only (`just test-compose` sets INFRA_TESTS=1).
const run = promisify(execFile);
const enabled = process.env.INFRA_TESTS === "1" && spawnSync("docker", ["compose", "version"]).status === 0;

/** A minimal S3 stand-in: path-style PUT, GET, DELETE and ListObjectsV2. It requires a SigV4 header and a payload hash that matches the body. */
function startFakeS3(objects: Map<string, Buffer>): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stand-in");
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const key = decodeURIComponent(url.pathname).replace(/^\/dumps\/?/, "");
      if (!/^AWS4-HMAC-SHA256 Credential=test-access\//.test(req.headers.authorization ?? "")) return void res.writeHead(403).end("unsigned");
      if (req.method === "PUT") {
        if (req.headers["x-amz-content-sha256"] !== createHash("sha256").update(body).digest("hex")) return void res.writeHead(400).end("bad payload hash");
        objects.set(key, body);
        return void res.writeHead(200).end();
      }
      if (req.method === "DELETE") {
        objects.delete(key);
        return void res.writeHead(204).end();
      }
      if (req.method === "GET" && key === "") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).map((k) => `<Contents><Key>${k}</Key></Contents>`);
        return void res.writeHead(200, { "content-type": "application/xml" }).end(`<ListBucketResult>${keys.join("")}</ListBucketResult>`);
      }
      const found = objects.get(key);
      if (req.method === "GET" && found) return void res.writeHead(200).end(found);
      res.writeHead(404).end("not found");
    });
  });
  return new Promise((resolve) => server.listen(0, "0.0.0.0", () => resolve(server)));
}

describe.skipIf(!enabled)("backups", () => {
  const objects = new Map<string, Buffer>();
  const project = `backups-test-${process.pid}`;
  const dir = mkdtempSync(join(tmpdir(), "backups-test-"));
  let server: Server;
  let env: Record<string, string>;

  // Asynchronous on purpose: the S3 stand-in lives in this process, and a blocking spawn would stop it answering.
  const exec = async (command: string, args: string[], extra: Record<string, string> = {}) => {
    try {
      const { stdout, stderr } = await run(command, args, { env: { ...process.env, ...env, ...extra }, maxBuffer: 16 * 1024 * 1024 });
      return { status: 0, output: `${stdout}${stderr}` };
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      return { status: failed.code ?? 1, output: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
    }
  };
  const compose = (...args: string[]) => exec("docker", ["compose", ...args]);
  const backup = (command: string[], extra: Record<string, string> = {}) => exec("bash", ["scripts/ops/backup-run.sh", ...command], extra);
  const query = async (database: string, sql: string) => (await compose("exec", "-T", "postgres", "psql", "-U", "postgres", "-d", database, "-Atc", sql)).output.trim();

  beforeAll(async () => {
    server = await startFakeS3(objects);
    // Loopback host port 0 is not allowed in a published port, so take a free one first.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const postgresPort = (probe.address() as AddressInfo).port;
    await new Promise((resolve) => probe.close(resolve));
    const override = join(dir, "override.yaml");
    writeFileSync(override, 'services:\n  backup:\n    extra_hosts: ["host.docker.internal:host-gateway"]\n');
    const fixture = Object.fromEntries(
      readFileSync("tests/fixtures/compose-check.env", "utf8")
        .split("\n")
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
    env = {
      ...fixture,
      COMPOSE_PROFILES: "backup",
      COMPOSE_FILE: `${join(process.cwd(), "compose.yaml")}:${join(process.cwd(), "compose.dev.yaml")}:${override}`,
      COMPOSE_PROJECT_NAME: project,
      POSTGRES_HOST_PORT: String(postgresPort),
      BACKUP_S3_ENDPOINT: `http://host.docker.internal:${(server.address() as AddressInfo).port}`,
      BACKUP_S3_BUCKET: "dumps",
      BACKUP_S3_ACCESS_KEY: "test-access",
      BACKUP_S3_SECRET_KEY: "test-secret", // gitleaks:allow
    };
    const up = await compose("up", "-d", "--wait", "postgres");
    expect(up.status, up.output).toBe(0);
    const seeded = await compose("exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "app", "-c", "create table probe (id int); insert into probe values (1), (2), (3)");
    expect(seeded.status, seeded.output).toBe(0);
  }, 180_000);

  afterAll(async () => {
    await compose("down", "--volumes", "--remove-orphans");
    await new Promise((resolve) => server?.close(resolve));
  }, 120_000);

  it("reports a missing destination or an empty bucket without ever failing the caller", async () => {
    const unset = await backup(["status"], { BACKUP_S3_ENDPOINT: "" });
    expect(unset.status).toBe(2);
    expect(unset.output).toContain("no off-host destination is configured");
    const empty = await backup(["status"]);
    expect(empty.status).toBe(1);
    expect(empty.output).toContain("no dump found");
  }, 180_000);

  it("dumps to the bucket, prunes dumps past the retention, and the last-success check goes green", async () => {
    objects.set("db/app-20200101T030000Z.dump", Buffer.from("expired"));
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    objects.set(`db/app-${recent}.dump`, Buffer.from("within the window"));
    const now = await backup(["now"]);
    expect(now.status, now.output).toBe(0);
    expect(now.output).toContain("BACKUP OK");
    const keys = [...objects.keys()].sort();
    expect(keys).toHaveLength(2);
    expect(keys.some((key) => key.startsWith("db/app-2020"))).toBe(false);
    const status = await backup(["status"]);
    expect(status.status, status.output).toBe(0);
    expect(status.output).toContain("last successful dump");
  }, 180_000);

  it("restores a dump into a new scratch database and never into the live one", async () => {
    const key = [...objects.keys()].find((k) => objects.get(k)!.length > 100)!;
    const restored = await backup(["restore", key, "scratch_check"]);
    expect(restored.status, restored.output).toBe(0);
    expect(await query("scratch_check", "select count(*) from probe")).toBe("3");
    expect((await backup(["restore", key, "scratch_check"])).output).toContain("already exists");
    expect((await backup(["restore", key, "app"])).output).toContain("refusing to restore into app");
  }, 180_000);

  it("does nothing while the backup profile is Off", async () => {
    const off = await backup(["status"], { COMPOSE_PROFILES: "" });
    expect(off.status).toBe(0);
    expect(off.output).toContain("Backups are Off");
    expect((await backup(["now"], { COMPOSE_PROFILES: "" })).status).toBe(1);
  });
});
