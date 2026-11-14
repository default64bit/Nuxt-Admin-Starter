// @vitest-environment node
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// `scripts/ops/autodeploy.sh` (the poller behind nuxt-admin-starter-autodeploy.timer) against a stub GitHub API and stub
// `just`/`docker` executables, and `autodeploy-status.sh`. Runs in `deploy-automation` only (`just test-compose` sets
// INFRA_TESTS=1) and is skipped when a host tool the poller needs is missing.
const tools = ["bash", "curl", "jq", "flock"];
const available = process.env.INFRA_TESTS === "1" && tools.every((tool) => spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0);
const realCurl = spawnSync("sh", ["-c", "command -v curl"], { encoding: "utf8" }).stdout.trim();

const sha = (char: string) => char.repeat(40);
const short = (value: string) => value.slice(0, 7);
const TOKEN = "ghp_SecretTokenValue1234567890abcdef";

type Deployment = { id: number; sha: string; creator: string; statuses: string[] };
type Post = { id: number; state: string; description: string; environment_url?: string };

const api = {
  deployments: [] as Deployment[],
  posts: [] as Post[],
  requests: [] as string[],
  auth: [] as string[],
  failStates: new Set<string>(),
  unauthorized: false,
  expiry: "",
};
let server: Server;
let port = 0;

function resetApi() {
  Object.assign(api, { deployments: [], posts: [], requests: [], auth: [], failStates: new Set<string>(), unauthorized: false, expiry: "" });
}

function queue(id: number, value: string, extra: Partial<Deployment> = {}): Deployment {
  const deployment = { id, sha: value, creator: "github-actions[bot]", statuses: ["queued"], ...extra };
  api.deployments.push(deployment);
  return deployment;
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stub");
    api.requests.push(`${request.method} ${url.pathname}${url.search}`);
    api.auth.push(String(request.headers.authorization ?? ""));
    const send = (code: number, body: unknown) => {
      if (api.expiry) response.setHeader("github-authentication-token-expiration", api.expiry);
      response.writeHead(code, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (api.unauthorized) return send(401, { message: "Bad credentials" });
    const base = "/repos/o/r/deployments";
    if (request.method === "GET" && url.pathname === base) {
      return send(200, api.deployments.map((d) => ({ id: d.id, sha: d.sha, ref: d.sha, environment: "production", creator: { login: d.creator } })));
    }
    const statuses = url.pathname.match(/^\/repos\/o\/r\/deployments\/(\d+)\/statuses$/);
    if (statuses) {
      const deployment = api.deployments.find((d) => d.id === Number(statuses[1]));
      if (!deployment) return send(404, {});
      if (request.method === "GET") return send(200, deployment.statuses.slice(0, 1).map((state) => ({ state })));
      let raw = "";
      request.on("data", (chunk) => (raw += chunk));
      request.on("end", () => {
        const body = JSON.parse(raw) as Post;
        if (api.failStates.has(body.state)) return send(500, { message: "boom" });
        deployment.statuses.unshift(body.state);
        api.posts.push({ ...body, id: deployment.id });
        send(201, {});
      });
      return;
    }
    send(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server?.close();
});

const justStub = `#!/usr/bin/env bash
echo "just $* | cwd=$(pwd -P) NUXT_APP_ENV=\${NUXT_APP_ENV:-} DEPLOY_APPROVED=\${DEPLOY_APPROVED:-} DEPLOY_STATE_DIR=\${DEPLOY_STATE_DIR:-}" >> "$STUB_DIR/just.log"
if [ "$1" = "deploy" ]; then
  . "$STUB_DIR/scenario"
  echo "stub deploy output for $2"
  [ -n "\${GUARD_MESSAGE:-}" ] && echo "$GUARD_MESSAGE" >&2
  [ -n "\${OUTCOME:-}" ] && printf 'SHA=%s\\nOUTCOME=%s\\nSTEP=%s\\n' "$2" "$OUTCOME" "$STEP" > "$DEPLOY_STATE_DIR/last-result.env"
  exit "\${EXIT_CODE:-0}"
fi
exit 0
`;

const dockerStub = `#!/usr/bin/env bash
echo "docker $*" >> "$STUB_DIR/docker.log"
case "$1" in
  pull) if [ -f "$STUB_DIR/pull-fails" ]; then echo "error pulling image: network unreachable" >&2; exit 1; fi ;;
  image) ;;
  create) echo stubcontainer ;;
  rm) ;;
  cp)
    item="\${2#stubcontainer:/app/}"
    case "$item" in
      scripts) mkdir -p "$3/scripts/ops" && echo "# new poller" > "$3/scripts/ops/autodeploy.sh" ;;
      ops) mkdir -p "$3/ops/caddy" && echo "x" > "$3/ops/caddy/base-images.txt" ;;
      *) echo "# $item" > "$3/$item" ;;
    esac ;;
esac
exit 0
`;

const curlWrapper = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$STUB_DIR/curl-argv.log"
exec "${realCurl}" "$@"
`;

let root: string;
let stub: string;
let stateDir: string;

function write(path: string, content: string, mode = 0o644) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
}

function scenario(values: Record<string, string>) {
  write(join(stub, "scenario"), Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n");
}

beforeEach(() => {
  resetApi();
  root = mkdtempSync(join(tmpdir(), "autodeploy-"));
  stub = join(root, "stub");
  stateDir = join(root, "shared", ".deploy");
  mkdirSync(stateDir, { recursive: true });
  write(join(root, "shared", "github-deployments.token"), `${TOKEN}\n`, 0o600);
  write(join(root, "shared", ".env"), "COMPOSE_PROFILES=edge\nSITE_DOMAIN=admin.test\nNUXT_PUBLIC_SITE_URL=https://admin.test\n");
  write(join(stub, "bin", "just"), justStub, 0o755);
  write(join(stub, "bin", "docker"), dockerStub, 0o755);
  write(join(stub, "bin", "curl"), curlWrapper, 0o755);
  scenario({ OUTCOME: "success", STEP: "done" });
  return () => rmSync(root, { recursive: true, force: true });
});

function run(extra: Record<string, string> = {}): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["scripts/ops/autodeploy.sh"], {
      env: {
        PATH: `${join(stub, "bin")}:${process.env.PATH}`,
        STUB_DIR: stub,
        AUTODEPLOY_ROOT: root,
        AUTODEPLOY_REPO: "o/r",
        AUTODEPLOY_API_URL: `http://127.0.0.1:${port}`,
        APP_IMAGE_REPO: "registry.test/admin",
        ...extra,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output }));
  });
}

const log = (name: string) => (existsSync(join(stub, name)) ? readFileSync(join(stub, name), "utf8") : "");
const deployCalls = () => log("just.log").split("\n").filter((line) => line.startsWith("just deploy "));
const attempted = () => (existsSync(join(stateDir, "attempted-shas")) ? readFileSync(join(stateDir, "attempted-shas"), "utf8").split("\n").filter(Boolean) : []);
const pendingReport = () => join(stateDir, "pending-report.json");

describe.skipIf(!available)("autodeploy poller", () => {
  it("prints nothing and changes nothing on a tick with nothing new", async () => {
    queue(2, sha("2"), { statuses: ["success"] });
    queue(1, sha("1"), { statuses: ["inactive"] });
    const { code, output } = await run();
    expect(code).toBe(0);
    expect(output).toBe("");
    expect(api.posts).toEqual([]);
    expect(log("docker.log")).toBe("");
    expect(deployCalls()).toEqual([]);
    expect(api.requests[0]).toContain("environment=production");
  });

  it("deploys the newest queued Deployment and marks older queued ones inactive", async () => {
    queue(3, sha("3"));
    queue(2, sha("2"));
    queue(1, sha("1"));
    const { code, output } = await run();
    expect(code).toBe(0);
    expect(api.posts.map((post) => [post.id, post.state])).toEqual([
      [2, "inactive"],
      [1, "inactive"],
      [3, "in_progress"],
      [3, "success"],
    ]);
    expect(api.posts[0]!.description).toBe(`superseded by ${short(sha("3"))}`);
    expect(api.posts[3]).toMatchObject({ state: "success", environment_url: "https://admin.test" });
    expect(deployCalls()).toHaveLength(1);
    const call = deployCalls()[0]!;
    expect(call).toContain(`just deploy ${sha("3")}`);
    expect(call).toContain(`cwd=${join(root, "releases", sha("3"))}`);
    expect(call).toContain("NUXT_APP_ENV=production DEPLOY_APPROVED=YES");
    expect(call).toContain(`DEPLOY_STATE_DIR=${stateDir}`);
    expect(log("docker.log")).toContain(`docker pull registry.test/admin/tools:${sha("3")}`);
    expect(readlinkSync(join(root, "releases", sha("3"), ".env"))).toBe(join(root, "shared", ".env"));
    expect(readlinkSync(join(root, "current"))).toBe(join(root, "releases", sha("3")));
    expect(readFileSync(join(root, "bin", "autodeploy"), "utf8")).toBe("# new poller\n");
    expect(log("just.log")).toMatch(/just prune-images \| cwd=.*releases\/3{40}/);
    expect(output).toContain("stub deploy output");
    expect(output).toContain(`candidate: ${short(sha("3"))}`);
    expect(attempted()).toEqual([]);
    expect(existsSync(pendingReport())).toBe(false);
  });

  it("ignores Deployments that github-actions[bot] did not create, attempted SHAs and Deployments that are not queued", async () => {
    writeFileSync(join(stateDir, "attempted-shas"), `${sha("3")}\n`);
    queue(5, sha("5"), { creator: "someone-else" });
    queue(4, sha("4"), { statuses: ["in_progress", "queued"] });
    queue(3, sha("3"));
    queue(2, sha("2"));
    await run();
    expect(deployCalls()).toHaveLength(1);
    expect(deployCalls()[0]).toContain(sha("2"));
    expect(api.posts.some((post) => [3, 4, 5].includes(post.id))).toBe(false);
  });

  const outcomes: Array<{ name: string; scenario: Record<string, string>; state: string; description: string; attempted: boolean }> = [
    { name: "success", scenario: { OUTCOME: "success", STEP: "done" }, state: "success", description: `Deployed ${short(sha("9"))}`, attempted: false },
    { name: "migrate", scenario: { OUTCOME: "aborted-before-switch", STEP: "migrate", EXIT_CODE: "1" }, state: "failure", description: "migrate failed; previous release still serving", attempted: true },
    { name: "seed", scenario: { OUTCOME: "aborted-before-switch", STEP: "seed", EXIT_CODE: "1" }, state: "failure", description: "seed failed; previous release still serving", attempted: true },
    { name: "reverted", scenario: { OUTCOME: "reverted", STEP: "start-release-and-verify", EXIT_CODE: "1" }, state: "failure", description: `smoke check failed; reverted to ${short(sha("8"))}`, attempted: true },
    { name: "revert-failed", scenario: { OUTCOME: "revert-failed", STEP: "start-release-and-verify", EXIT_CODE: "1" }, state: "failure", description: "REVERT FAILED, site may be down", attempted: true },
    { name: "revert-impossible", scenario: { OUTCOME: "revert-impossible", STEP: "start-release-and-verify", EXIT_CODE: "1" }, state: "failure", description: "failed, no previous release", attempted: true },
    { name: "guard", scenario: { OUTCOME: "guard", STEP: "guard", EXIT_CODE: "1", GUARD_MESSAGE: "Set ACME_EMAIL for Let's Encrypt certificate notifications" }, state: "error", description: "host configuration invalid: Set ACME_EMAIL for Let's Encrypt certificate notifications", attempted: false },
    { name: "no result file", scenario: { EXIT_CODE: "1" }, state: "failure", description: "deploy ended without a result; check the host before retrying", attempted: true },
  ];

  it.each(outcomes)("reports the $name outcome as the specified status", async (expected) => {
    writeFileSync(join(stateDir, "release.env"), `CURRENT_SHA=${sha("8")}\nPREVIOUS_SHA=${sha("7")}\n`);
    scenario(expected.scenario);
    queue(1, sha("9"));
    const { output } = await run();
    const final = api.posts.at(-1)!;
    expect(api.posts[0]!.state).toBe("in_progress");
    expect(final.state).toBe(expected.state);
    expect(final.description).toBe(expected.description);
    expect(final.description.length).toBeLessThanOrEqual(140);
    expect(attempted()).toEqual(expected.attempted ? [sha("9")] : []);
    expect(existsSync(pendingReport())).toBe(false);
    expect(output).toContain(`deploy finished: ${short(sha("9"))} -> ${expected.state}`);
    if (expected.state !== "success") expect(final.environment_url).toBeUndefined();
  });

  describe("transient failures leave the Deployment queued", () => {
    it("when the tools image cannot be pulled", async () => {
      write(join(stub, "pull-fails"), "");
      queue(1, sha("9"));
      const { code, output } = await run();
      expect(code).toBe(0);
      expect(output).toContain("transient");
      expect(api.posts).toEqual([]);
      expect(deployCalls()).toEqual([]);
      expect(attempted()).toEqual([]);
      expect(api.deployments[0]!.statuses[0]).toBe("queued");
      rmSync(join(stub, "pull-fails"));
      await run();
      expect(deployCalls()).toHaveLength(1);
    });

    it("when the deploy lock is busy or the image pull fails inside just deploy", async () => {
      for (const step of ["lock", "pull-images", "verify-images"]) {
        resetApi();
        rmSync(pendingReport(), { force: true });
        scenario({ OUTCOME: "aborted-before-switch", STEP: step, EXIT_CODE: "1" });
        queue(1, sha("9"));
        await run();
        expect(api.posts.map((post) => post.state), step).toEqual(["in_progress", "queued"]);
        expect(attempted()).toEqual([]);
        expect(api.deployments[0]!.statuses[0]).toBe("queued");
      }
      // Still eligible: the next tick deploys it.
      scenario({ OUTCOME: "success", STEP: "done" });
      await run();
      expect(api.posts.at(-1)!.state).toBe("success");
    });
  });

  it("retries a failed status post on the next tick without redeploying", async () => {
    queue(1, sha("9"));
    api.failStates.add("success");
    const first = await run();
    expect(first.output).toContain("report pending");
    expect(deployCalls()).toHaveLength(1);
    expect(existsSync(pendingReport())).toBe(true);
    expect(api.deployments[0]!.statuses[0]).toBe("in_progress");

    api.failStates.clear();
    const retried = await run();
    expect(retried.output).toContain(`report posted: success for ${short(sha("9"))}`);
    expect(api.posts.at(-1)).toMatchObject({ id: 1, state: "success", environment_url: "https://admin.test" });
    expect(deployCalls()).toHaveLength(1);
    expect(existsSync(pendingReport())).toBe(false);
  });

  it("does not deploy while paused, logs that once, and resumes when the flag is removed", async () => {
    queue(1, sha("9"));
    writeFileSync(join(stateDir, "autodeploy.paused"), "");
    const first = await run();
    expect(first.output).toContain("paused");
    expect(deployCalls()).toEqual([]);
    expect(api.posts).toEqual([]);
    expect((await run()).output).toBe("");
    rmSync(join(stateDir, "autodeploy.paused"));
    await run();
    expect(deployCalls()).toHaveLength(1);
  });

  it("never exposes the token in output, process arguments or the journal, and fails visibly without or with a rejected one", async () => {
    queue(1, sha("1"));
    scenario({ OUTCOME: "reverted", STEP: "start-release-and-verify", EXIT_CODE: "1" });
    const happy = await run();
    api.unauthorized = true;
    queue(3, sha("3"));
    const rejected = await run();
    expect(rejected.code).toBe(1);
    expect(rejected.output).toContain("rejected the token");
    for (const text of [happy.output, rejected.output, log("curl-argv.log"), log("just.log"), log("docker.log")]) {
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain("ghp_");
    }
    expect(log("curl-argv.log")).not.toMatch(/Authorization/i);
    expect(api.auth.some((header) => header === `Bearer ${TOKEN}`)).toBe(true);
    expect(api.requests.join("\n")).not.toContain(TOKEN);

    rmSync(join(root, "shared", "github-deployments.token"));
    const missing = await run();
    expect(missing.code).toBe(1);
    expect(missing.output).toContain("token file");
  });

  describe("daily checks", () => {
    it("warns once a day about a token that expires within 30 days", async () => {
      api.expiry = `${new Date(Date.now() + 10 * 86_400_000).toISOString().replace("T", " ").slice(0, 19)} UTC`;
      const first = await run();
      expect(first.output).toMatch(/WARNING: the GitHub token expires in \d+ day/);
      expect((await run()).output).toBe("");
    });

    it("relays certificate warnings from cert-status.sh", async () => {
      const dir = join(root, "releases", sha("a"));
      mkdirSync(dir, { recursive: true });
      symlinkSync(dir, join(root, "current"));
      write(join(dir, "scripts", "ops", "cert-status.sh"), "#!/usr/bin/env bash\necho \"WARNING: ${SITE_DOMAIN} (${COMPOSE_PROFILES}): certificate expires in 3 day(s)\"\necho 'admin.test fine'\n", 0o755);
      const { output } = await run();
      expect(output).toContain("WARNING: admin.test (edge): certificate expires in 3 day(s)");
      expect(output).not.toContain("admin.test fine");
    });
  });
});

describe.skipIf(!available)("autodeploy-status", () => {
  function status(env: Record<string, string> = {}, cwd = root) {
    const result = spawnSync("bash", [join(process.cwd(), "scripts/ops/autodeploy-status.sh")], {
      cwd,
      encoding: "utf8",
      env: { PATH: process.env.PATH, DEPLOY_STATE_DIR: stateDir, AUTODEPLOY_ROOT: root, SYSTEMD_UNIT_DIR: join(root, "units"), ...env },
    });
    return { code: result.status, output: `${result.stdout}${result.stderr}` };
  }

  it("says the automation is not installed on a host without units", () => {
    expect(status().output).toContain("not installed");
  });

  it("warns about an unposted report and a token that expires soon", () => {
    mkdirSync(join(root, "units"));
    write(join(root, "units", "nuxt-admin-starter-autodeploy.timer"), "x");
    write(join(stateDir, "pending-report.json"), JSON.stringify({ deployment_id: 1, sha: sha("9"), status: { state: "success", description: "Deployed 9999999" } }));
    write(join(stateDir, "token-expiry"), `${new Date(Date.now() + 5 * 86_400_000).toISOString().replace("T", " ").slice(0, 19)} UTC\n`);
    const { code, output } = status();
    expect(code).toBe(0);
    expect(output).toContain("unposted report");
    expect(output).toContain("success for 9999999");
    expect(output).toMatch(/WARNING: the GitHub Deployments token expires in \d+ day/);
  });

  it("warns when an installed unit or poller differs from this release's copy", () => {
    const release = join(root, "release");
    write(join(release, "ops", "systemd", "nuxt-admin-starter-autodeploy.service"), "new\n");
    write(join(release, "ops", "systemd", "nuxt-admin-starter-autodeploy.timer"), "same\n");
    write(join(release, "scripts", "ops", "autodeploy.sh"), "new poller\n");
    write(join(root, "units", "nuxt-admin-starter-autodeploy.service"), "old\n");
    write(join(root, "units", "nuxt-admin-starter-autodeploy.timer"), "same\n");
    write(join(root, "bin", "autodeploy"), "old poller\n");
    const { output } = status({}, release);
    expect(output).toContain("nuxt-admin-starter-autodeploy.service differs");
    expect(output).not.toContain("nuxt-admin-starter-autodeploy.timer differs");
    expect(output).toContain("bin/autodeploy differs");
  });
});
