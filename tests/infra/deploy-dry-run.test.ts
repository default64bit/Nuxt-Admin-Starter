// @vitest-environment node
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Dry-run of `just deploy` against a disposable Compose project: stub images stand in for CI-built releases and there is
// no edge proxy or real PostgreSQL. Runs in `deploy-automation` only (`just test-compose` sets INFRA_TESTS=1).
const available = process.env.INFRA_TESTS === "1" && ["docker compose version", "just --version"].every((command) => {
  const [bin, ...args] = command.split(" ");
  return spawnSync(bin!, args).status === 0;
});

const project = `nas-deploy-dryrun-${process.pid}`;
const imageRepo = "nuxt-admin-starter-deploy-stub";
const appPort = String(20_000 + Math.floor(Math.random() * 20_000));
const sha = (char: string) => char.repeat(40);
const GOOD_A = sha("a");
const GOOD_B = sha("b");
const MISSING = sha("c");
const FAIL_MIGRATE = sha("d");
const UNREADY = sha("e");
const UNREADY_2 = sha("f");
const stateDir = mkdtempSync(join(tmpdir(), "deploy-state-"));
const logDir = mkdtempSync(join(tmpdir(), "deploy-log-"));
const fixture = Object.fromEntries(
  readFileSync("tests/fixtures/compose-check.env", "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

// The VPS has no Node: build a PATH that holds every host tool except Node and its package managers, so a recipe
// that still reaches for host `node` fails here. Entries are symlinked so the real tools keep working.
function pathWithoutNode() {
  const blocked = new Set(["node", "nodejs", "corepack", "pnpm", "pnpx", "npm", "npx", "yarn", "bun"]);
  const dir = mkdtempSync(join(tmpdir(), "deploy-nonode-"));
  for (const source of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    if (!existsSync(source)) continue;
    for (const name of readdirSync(source)) {
      if (blocked.has(name) || existsSync(join(dir, name))) continue;
      try {
        symlinkSync(join(source, name), join(dir, name));
      } catch {
        // unreadable or racing entry: skip
      }
    }
  }
  return dir;
}

const baseEnv: Record<string, string> = {
  ...(process.env as Record<string, string>),
  PATH: available ? pathWithoutNode() : (process.env.PATH ?? ""),
  ...fixture,
  NUXT_APP_ENV: "production",
  DEPLOY_APPROVED: "YES",
  // Every Optional piece Off: no edge proxy, no GlitchTip, no media storage, no backup.
  COMPOSE_PROFILES: "",
  NUXT_PUBLIC_SITE_URL: "https://admin.test",
  DEPLOY_COMPOSE_FILE: "compose.yaml:compose.prod.yaml:tests/fixtures/deploy-stub/compose.test.yaml",
  PRUNE_IMAGE_REPOS: imageRepo,
  DEPLOY_STATE_DIR: stateDir,
  DRYRUN_LOG_DIR: logDir,
  COMPOSE_PROJECT_NAME: project,
  APP_HOST_PORT: appPort,
  SMOKE_ATTEMPTS: "3",
  SMOKE_DELAY_SECONDS: "1",
};

function release(command: "deploy" | "rollback", target: string, overrides: Record<string, string> = {}, cwd?: string) {
  const result = spawnSync("just", [command, target], { encoding: "utf8", cwd, env: { ...baseEnv, ...overrides }, timeout: 280_000 });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function compose(...args: string[]) {
  return spawnSync("docker", ["compose", ...args], { encoding: "utf8", env: { ...baseEnv, COMPOSE_FILE: baseEnv.DEPLOY_COMPOSE_FILE!, APP_IMAGE_TAG: GOOD_A } });
}

const deploy = (target: string, overrides: Record<string, string> = {}, cwd?: string) => release("deploy", target, overrides, cwd);
const rollback = (target: string) => release("rollback", target);
const justRecipe = (recipe: string, cwd?: string) => {
  const result = spawnSync("just", [recipe], { encoding: "utf8", cwd, env: baseEnv, timeout: 120_000 });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};
const serviceImages = () =>
  Object.fromEntries(
    compose("ps", "--format", "{{.Service}} {{.Image}}")
      .stdout.trim()
      .split("\n")
      .map((line) => line.split(" ") as [string, string]),
  );
const imageExists = (tag: string) => spawnSync("docker", ["image", "inspect", `${imageRepo}:${tag}`]).status === 0;
const ready = async () => (await fetch(`http://127.0.0.1:${appPort}/api/health/ready`).catch(() => ({ status: 0 }))).status;
const containers = () => compose("ps", "-a", "--format", "{{.Name}}").stdout.trim();
const events = () => (existsSync(join(logDir, "events.log")) ? readFileSync(join(logDir, "events.log"), "utf8").trim().split("\n") : []);
const state = () => readFileSync(join(stateDir, "release.env"), "utf8");
const lastResult = () => readFileSync(join(stateDir, "last-result.env"), "utf8");
const resultOf = (target: string, outcome: string, step: string) => `SHA=${target}\nOUTCOME=${outcome}\nSTEP=${step}\n`;
const setState = (current: string, previous: string) => writeFileSync(join(stateDir, "release.env"), `CURRENT_SHA=${current}\nPREVIOUS_SHA=${previous}\n`);

// A per-release directory as the poller extracts it: the deploy files of one release under releases/<sha>/. The
// app service carries a label naming the files it came from, so a test can tell which directory a switch used.
const releasesDir = join(mkdtempSync(join(tmpdir(), "deploy-releases-")), "releases");
const releaseDirPath = (target: string) => join(releasesDir, target);
const labelOverlay = "tests/fixtures/deploy-stub/release-label.yaml";
function makeReleaseDir(target: string, label: string) {
  const dir = releaseDirPath(target);
  mkdirSync(join(dir, "tests/fixtures/deploy-stub"), { recursive: true });
  for (const entry of ["justfile", "compose.yaml", "compose.prod.yaml", "compose.dev.yaml", "Caddyfile", "scripts", "ops"]) cpSync(entry, join(dir, entry), { recursive: true });
  cpSync("tests/fixtures/deploy-stub/compose.test.yaml", join(dir, "tests/fixtures/deploy-stub/compose.test.yaml"));
  writeFileSync(join(dir, labelOverlay), `services:\n  app:\n    labels:\n      dryrun.release-files: ${label}\n`);
  return dir;
}
const withLabel = { DEPLOY_COMPOSE_FILE: `${baseEnv.DEPLOY_COMPOSE_FILE}:${labelOverlay}` };
const appLabel = () => {
  const id = compose("ps", "-q", "app").stdout.trim();
  return spawnSync("docker", ["inspect", "--format", '{{ index .Config.Labels "dryrun.release-files" }}', id], { encoding: "utf8" }).stdout.trim();
};

function buildStub(tag: string, args: Record<string, string>) {
  const buildArgs = Object.entries(args).flatMap(([key, value]) => ["--build-arg", `${key}=${value}`]);
  const result = spawnSync("docker", ["build", "-q", "-t", `${imageRepo}:${tag}`, ...buildArgs, "tests/fixtures/deploy-stub"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`stub image build failed: ${result.stderr}`);
}

describe.skipIf(!available)("just deploy dry-run", () => {
  beforeAll(() => {
    mkdirSync(logDir, { recursive: true });
    buildStub("infra", {});
    buildStub(GOOD_A, { SHA: GOOD_A });
    buildStub(GOOD_B, { SHA: GOOD_B });
    buildStub(FAIL_MIGRATE, { SHA: FAIL_MIGRATE, BEHAVIOR: "fail-migrate" });
    buildStub(UNREADY, { SHA: UNREADY, BEHAVIOR: "unready" });
    buildStub(UNREADY_2, { SHA: UNREADY_2, BEHAVIOR: "unready" });
  }, 280_000);

  afterAll(() => {
    compose("--profile", "*", "down", "--volumes", "--remove-orphans");
    for (const tag of ["infra", GOOD_A, GOOD_B, FAIL_MIGRATE, UNREADY, UNREADY_2]) spawnSync("docker", ["rmi", "-f", `${imageRepo}:${tag}`]);
  }, 120_000);

  it("refuses on guard failures without starting or recording anything", () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ["short sha", {}, "abc"],
      ["not production", { NUXT_APP_ENV: "local" }, GOOD_A],
      ["no approval", { DEPLOY_APPROVED: "" }, GOOD_A],
      ["placeholder public URL", { NUXT_PUBLIC_SITE_URL: "https://app.example.com" }, GOOD_A],
      ["edge on with a placeholder domain", { COMPOSE_PROFILES: "edge", SITE_DOMAIN: "app.example.com", ACME_EMAIL: "ops@admin.test" }, GOOD_A],
      ["edge on with a www hostname", { COMPOSE_PROFILES: "edge", SITE_DOMAIN: "www.admin.test", ACME_EMAIL: "ops@admin.test" }, GOOD_A],
    ];
    for (const [label, overrides, target] of cases) {
      const { status, output } = deploy(target, overrides);
      expect(status, label).not.toBe(0);
      if (label === "edge on with a www hostname") expect(output).toContain("without a www. prefix");
    }
    expect(containers()).toBe("");
    expect(events()).toEqual([]);
    expect(existsSync(join(stateDir, "release.env"))).toBe(false);
    expect(lastResult()).toBe(resultOf(GOOD_A, "guard", "guard"));
  });

  it("aborts before changing anything when the release image is unavailable", () => {
    const { status, output } = deploy(MISSING);
    expect(status).not.toBe(0);
    expect(output).toContain("DEPLOY FAILED at step: verify images");
    expect(containers()).not.toMatch(/app/);
    expect(events()).toEqual([]);
    expect(lastResult()).toBe(resultOf(MISSING, "aborted-before-switch", "verify-images"));
  });

  it("runs migrate and seed before switching the app, smoke-checks it, records the release and skips the Off pieces", () => {
    const { status, output } = deploy(GOOD_A);
    expect(output).toContain(`Deployed ${GOOD_A}`);
    expect(status).toBe(0);
    // Media, backup and monitoring are Off: no storage-init, no backup report, no GlitchTip.
    expect(events()).toEqual([`db:migrate ${GOOD_A}`, `db:seed ${GOOD_A}`]);
    expect(output).toContain("skipping storage initialization");
    expect(output).toContain("skipping the backup report");
    expect(compose("ps", "--status", "running", "--format", "{{.Service}}").stdout).toMatch(/app/);
    expect(containers()).not.toMatch(/glitchtip/);
    expect(state()).toBe(`CURRENT_SHA=${GOOD_A}\nPREVIOUS_SHA=\n`);
    expect(output).toContain("ok   readiness: /api/health/ready");
    expect(lastResult()).toBe(resultOf(GOOD_A, "success", "done"));
  }, 290_000);

  it("moves the previous release marker on the next deploy and starts GlitchTip only when monitoring is listed", () => {
    const { status } = deploy(GOOD_B, { COMPOSE_PROFILES: "monitoring" });
    expect(status).toBe(0);
    expect(state()).toBe(`CURRENT_SHA=${GOOD_B}\nPREVIOUS_SHA=${GOOD_A}\n`);
    expect(compose("ps", "--status", "running", "--format", "{{.Service}}").stdout).toMatch(/glitchtip/);
  }, 290_000);

  it("keeps the old release serving when a migration fails", async () => {
    const before = events().length;
    const { status, output } = deploy(FAIL_MIGRATE);
    expect(status).not.toBe(0);
    expect(output).toContain("DEPLOY FAILED at step: migrate");
    expect(events().slice(before)).toEqual([`db:migrate ${FAIL_MIGRATE}`]);
    expect(lastResult()).toBe(resultOf(FAIL_MIGRATE, "aborted-before-switch", "migrate"));
    expect(serviceImages().app).toBe(`${imageRepo}:${GOOD_B}`);
    expect(await ready()).toBe(200);
    expect(state()).toBe(`CURRENT_SHA=${GOOD_B}\nPREVIOUS_SHA=${GOOD_A}\n`);
  }, 290_000);

  it("reverts the app to the previous release when verification fails", async () => {
    const { status, output } = deploy(UNREADY);
    expect(status).not.toBe(0);
    expect(output).toContain("DEPLOY FAILED at step: start release and verify");
    expect(output).toContain(`Reverted to previous release ${GOOD_B}`);
    expect(serviceImages().app).toBe(`${imageRepo}:${GOOD_B}`);
    expect(await ready()).toBe(200);
    expect(state()).toBe(`CURRENT_SHA=${GOOD_B}\nPREVIOUS_SHA=${GOOD_A}\n`);
    expect(lastResult()).toBe(resultOf(UNREADY, "reverted", "start-release-and-verify"));
  }, 290_000);

  it("rolls back to an earlier release without running migrations or seeds", () => {
    const before = events().length;
    const { status, output } = rollback(GOOD_A);
    expect(output).toContain(`Rolled back to ${GOOD_A}`);
    expect(status).toBe(0);
    expect(events().slice(before)).toEqual([]);
    expect(serviceImages().app).toBe(`${imageRepo}:${GOOD_A}`);
    expect(state()).toBe(`CURRENT_SHA=${GOOD_A}\nPREVIOUS_SHA=${GOOD_B}\n`);
    expect(readFileSync(join(stateDir, "attempted-shas"), "utf8")).toBe(`${GOOD_B}\n`);
  }, 290_000);

  it("refuses a deploy while another deploy or rollback holds the lock", async () => {
    const holder = spawn("flock", ["-n", join(stateDir, "deploy.lock"), "sleep", "60"], { detached: true });
    await new Promise((resolve) => setTimeout(resolve, 700));
    try {
      const { status, output } = deploy(GOOD_B);
      expect(status).not.toBe(0);
      expect(output).toContain("already in progress");
      expect(lastResult()).toBe(resultOf(GOOD_B, "aborted-before-switch", "lock"));
      expect(serviceImages().app).toBe(`${imageRepo}:${GOOD_A}`);
      expect(state()).toBe(`CURRENT_SHA=${GOOD_A}\nPREVIOUS_SHA=${GOOD_B}\n`);
    } finally {
      process.kill(-holder.pid!);
    }
  }, 60_000);

  it("reports a failed revert and an impossible revert distinctly", () => {
    setState(MISSING, "");
    const failed = deploy(UNREADY_2);
    expect(failed.status).not.toBe(0);
    expect(failed.output).toContain("REVERT FAILED");
    expect(lastResult()).toBe(resultOf(UNREADY_2, "revert-failed", "start-release-and-verify"));

    setState("", "");
    const impossible = deploy(UNREADY_2);
    expect(impossible.status).not.toBe(0);
    expect(impossible.output).toContain("REVERT IMPOSSIBLE");
    expect(lastResult()).toBe(resultOf(UNREADY_2, "revert-impossible", "start-release-and-verify"));
  }, 290_000);

  it("reverts from the previous release directory's own Compose file", () => {
    // Heal the stack left unready by the test above, then deploy from releases/<new>/ with releases/<previous>/ beside it.
    expect(rollback(GOOD_A).status).toBe(0);
    setState(GOOD_A, GOOD_B);
    makeReleaseDir(GOOD_A, "previous-release-files");
    const newDir = makeReleaseDir(UNREADY, "new-release-files");
    const { status, output } = deploy(UNREADY, withLabel, newDir);
    expect(status).not.toBe(0);
    expect(output).toContain(`Reverting app to previous release ${GOOD_A} (files from ${releaseDirPath(GOOD_A)})`);
    expect(output).toContain(`Reverted to previous release ${GOOD_A}`);
    expect(serviceImages().app).toBe(`${imageRepo}:${GOOD_A}`);
    expect(appLabel()).toBe("previous-release-files");
    expect(lastResult()).toBe(resultOf(UNREADY, "reverted", "start-release-and-verify"));
  }, 290_000);

  it("reports release status and toggles the automatic deployment pause flag", () => {
    const status = justRecipe("release-status");
    expect(status.status).toBe(0);
    expect(status.output).toContain(`CURRENT_SHA=${GOOD_A}`);
    expect(status.output).toContain(`PREVIOUS_SHA=${GOOD_B}`);
    expect(status.output).toContain("Edge profile is Off");
    const flag = join(stateDir, "autodeploy.paused");
    expect(justRecipe("autodeploy-pause").status).toBe(0);
    expect(existsSync(flag)).toBe(true);
    expect(justRecipe("release-status").output).toContain("Automatic deployment is PAUSED");
    expect(justRecipe("autodeploy-resume").status).toBe(0);
    expect(existsSync(flag)).toBe(false);
  }, 120_000);

  it("prunes release images and directories other than the current and previous release", () => {
    expect(imageExists(FAIL_MIGRATE)).toBe(true);
    expect(imageExists(UNREADY)).toBe(true);
    makeReleaseDir(GOOD_B, "previous-files");
    makeReleaseDir(FAIL_MIGRATE, "old-files");
    symlinkSync(releaseDirPath(GOOD_A), join(releasesDir, "current"));
    const { status } = justRecipe("prune-images", releaseDirPath(GOOD_A));
    expect(status).toBe(0);
    expect(imageExists(FAIL_MIGRATE)).toBe(false);
    expect(imageExists(UNREADY)).toBe(false);
    expect(imageExists(GOOD_A)).toBe(true);
    expect(imageExists(GOOD_B)).toBe(true);
    expect(readdirSync(releasesDir).sort()).toEqual(["current", GOOD_A, GOOD_B].sort());
  }, 120_000);
});
