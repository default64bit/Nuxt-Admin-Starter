// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/ops/ghcr-retry.sh retries a GHCR push only for the 403 "write_package" race a package hits on its first
// push (the first write creates the package; the next write is denied until it is linked to the repository).
const helper = "scripts/ops/ghcr-retry.sh";
const denied = "denied: permission_denied: write_package";

// A stub command that fails with `message` on its first `failures` calls, then succeeds. Calls are counted in a file.
function stub(failures: number, message: string) {
  const dir = mkdtempSync(join(tmpdir(), "ghcr-retry-"));
  const counter = join(dir, "calls");
  writeFileSync(counter, "0");
  const script = join(dir, "push.sh");
  writeFileSync(
    script,
    `#!/usr/bin/env bash
n=$(( $(cat "${counter}") + 1 )); echo "$n" > "${counter}"
if [ "$n" -le ${failures} ]; then echo "ERROR: failed to push: ${message}" >&2; exit 1; fi
echo "pushed $*"
`,
    { mode: 0o755 },
  );
  return { script, calls: () => Number(readFileSync(counter, "utf8").trim()) };
}

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync("bash", [helper, ...args], { encoding: "utf8", env: { ...process.env, GHCR_RETRY_DELAY_SECONDS: "0", ...env } });
}

describe("ghcr-retry.sh", () => {
  it("runs the command once when it succeeds and passes its arguments through", () => {
    const { script, calls } = stub(0, denied);
    const result = run([script, "ghcr.io/x/app:abc"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("pushed ghcr.io/x/app:abc");
    expect(calls()).toBe(1);
  });

  it("retries a write_package denial and succeeds on a later attempt", () => {
    const { script, calls } = stub(2, denied);
    const result = run([script]);
    expect(result.status).toBe(0);
    expect(calls()).toBe(3);
    expect(result.stderr).toContain("retrying");
  });

  it("also retries a bare 403 Forbidden from the GHCR upload endpoint", () => {
    const { script, calls } = stub(1, "unexpected status from POST request to https://ghcr.io/v2/o/r/blobs/uploads/: 403 Forbidden");
    expect(run([script]).status).toBe(0);
    expect(calls()).toBe(2);
  });

  it("gives up after the attempt limit with the command's exit status", () => {
    const { script, calls } = stub(10, denied);
    const result = run([script], { GHCR_RETRY_ATTEMPTS: "3" });
    expect(result.status).toBe(1);
    expect(calls()).toBe(3);
    expect(result.stderr).toContain(denied);
  });

  it("does not retry any other failure", () => {
    const { script, calls } = stub(10, "manifest unknown");
    const result = run([script]);
    expect(result.status).toBe(1);
    expect(calls()).toBe(1);
  });

  it("requires a command", () => {
    expect(run([]).status).not.toBe(0);
  });
});
