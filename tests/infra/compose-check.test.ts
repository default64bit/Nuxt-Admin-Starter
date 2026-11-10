// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Docker-based infra tests run in the `deploy-automation` CI job only (`just test-compose` sets INFRA_TESTS=1), so
// the default `just test` and the Postgres integration job never repeat them.
const enabled = process.env.INFRA_TESTS === "1" && spawnSync("docker", ["compose", "version"]).status === 0;
const fixture = readFileSync("tests/fixtures/compose-check.env", "utf8");
const withProfiles = (profiles: string) => fixture.replace(/^COMPOSE_PROFILES=.*$/m, `COMPOSE_PROFILES=${profiles}`);

function runCheck(envText: string, cwd: string) {
  const envFile = join(mkdtempSync(join(tmpdir(), "compose-check-env-")), "env");
  writeFileSync(envFile, envText);
  const result = spawnSync("node", [join(process.cwd(), "scripts/ops/compose-check.mjs")], {
    encoding: "utf8",
    cwd,
    env: { PATH: process.env.PATH, COMPOSE_CHECK_ENV_FILE: envFile },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const run = (envText: string) => runCheck(envText, process.cwd());

/** Runs the check against a temporary copy of the Compose files with one of them edited. */
function withOverlay(file: string, mutate: (text: string) => string, envText = fixture) {
  const dir = mkdtempSync(join(tmpdir(), "compose-overlay-"));
  for (const name of ["compose.yaml", "compose.dev.yaml", "compose.prod.yaml"]) {
    const text = readFileSync(name, "utf8");
    writeFileSync(join(dir, name), name === file ? mutate(text) : text);
  }
  return runCheck(envText, dir);
}

describe.skipIf(!enabled)("compose-check", () => {
  it("passes for dev and prod with a valid environment, with Optional pieces on or all Off", () => {
    for (const profiles of ["media,edge,backup", "monitoring", ""]) {
      const { status, output } = run(withProfiles(profiles));
      expect(output).toContain("compose-check passed");
      expect(status).toBe(0);
    }
  });

  it("fails naming the variable when a required variable is missing", () => {
    const { status, output } = run(fixture.replace(/^NUXT_SESSION_PASSWORD=.*$/m, ""));
    expect(status).not.toBe(0);
    expect(output).toContain("NUXT_SESSION_PASSWORD");
  });

  it("fails on a profile name that is not an Optional piece", () => {
    const { status, output } = run(withProfiles("media,cdn"));
    expect(status).not.toBe(0);
    expect(output).toMatch(/COMPOSE_PROFILES: unknown profile "cdn"/);
  });

  it("fails when a running service requires a service whose profile is Off", () => {
    const addOptionalDependency = (text: string) =>
      text
        .replace("\nnetworks:\n  backend:", "  storage:\n    image: ghcr.io/default64bit/nuxt-admin-starter/base/postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c\n    profiles: [media]\n    networks: [backend]\n    logging: *logging\n\nnetworks:\n  backend:")
        .replace("      postgres:\n        condition: service_healthy\n    healthcheck:", "      postgres:\n        condition: service_healthy\n      storage:\n        condition: service_started\n    healthcheck:");
    const on = withOverlay("compose.yaml", addOptionalDependency, withProfiles("media"));
    expect(on.status, on.output).toBe(0);
    const off = withOverlay("compose.yaml", addOptionalDependency, withProfiles("edge,backup"));
    expect(off.status).not.toBe(0);
    expect(off.output).toMatch(/app: requires "storage" \(profile media\), which is Off/);
  });

  it("fails when an Optional piece's service is not behind its profile", () => {
    const { status, output } = withOverlay("compose.yaml", (t) => t.replace(/( {2}glitchtip:\n) {4}profiles: \[monitoring\]\n/, "$1"));
    expect(status).not.toBe(0);
    expect(output).toMatch(/glitchtip: must sit behind the "monitoring" profile/);
  });

  it("fails on a floating latest tag", () => {
    const { status, output } = withOverlay("compose.yaml", (t) => t.replace(/image: postgres:[^\n]+/, "image: postgres:latest"));
    expect(status).not.toBe(0);
    expect(output).toMatch(/postgres.*latest/);
  });

  it("fails on a base image without a digest pin", () => {
    const { status, output } = withOverlay("compose.yaml", (t) => t.replace(/(image: postgres:[^@\n]+)@sha256:[0-9a-f]{64}/, "$1"));
    expect(status).not.toBe(0);
    expect(output).toMatch(/postgres.*digest/);
  });

  it("fails on a prod-overlay image outside the project GHCR namespace", () => {
    const { status, output } = withOverlay("compose.prod.yaml", (t) => t.replace(/image: \$\{APP_IMAGE_REPO:-ghcr\.io\/default64bit\/nuxt-admin-starter\}\/base\/postgres:/, "image: postgres:"));
    expect(status).not.toBe(0);
    expect(output).toMatch(/postgres.*ghcr\.io\/default64bit\/nuxt-admin-starter\//);
  });

  it("fails when the prod overlay drifts from the digest pinned in the shared base file", () => {
    const { status, output } = withOverlay("compose.prod.yaml", (t) => t.replace(/(base\/postgres:[^@\n]+@sha256:)[0-9a-f]{64}/, "$1" + "0".repeat(64)));
    expect(status).not.toBe(0);
    expect(output).toMatch(/postgres.*does not match/);
  });

  it("fails when the Caddy image drifts from the pin in ops/caddy/base-images.txt", () => {
    const { status, output } = withOverlay("compose.prod.yaml", (t) => t.replace(/(base\/caddy:[^@\n]+@sha256:)[0-9a-f]{64}/, "$1" + "0".repeat(64)));
    expect(status).not.toBe(0);
    expect(output).toMatch(/caddy: image .* must be the mirrored base image/);
  });

  it("fails when the app port is not published for the Project's own proxy (edge Off)", () => {
    const { status, output } = withOverlay("compose.yaml", (t) => t.replace("      - 127.0.0.1:${APP_HOST_PORT:-3000}:3000\n", "      []\n").replace("    ports:\n      []\n", ""), withProfiles(""));
    expect(status).not.toBe(0);
    expect(output).toMatch(/app: must publish port 3000/);
  });

  it("fails on a publicly bound database port", () => {
    const { status, output } = withOverlay("compose.yaml", (t) => t.replace("127.0.0.1:${POSTGRES_HOST_PORT:-5432}:5432", "${POSTGRES_HOST_PORT:-5432}:5432"));
    expect(status).not.toBe(0);
    expect(output).toMatch(/postgres.*127\.0\.0\.1/);
  });

  it("fails on a build section in the production overlay", () => {
    const { status, output } = withOverlay("compose.prod.yaml", (t) => t.replace("  app:\n    image:", "  app:\n    build:\n      context: .\n    image:"));
    expect(status).not.toBe(0);
    expect(output).toMatch(/build section/);
  });

  it("fails when a service loses log rotation", () => {
    const { status, output } = withOverlay("compose.yaml", (t) => t.replace("    logging: *logging\n\n  app:", "\n  app:"));
    expect(status).not.toBe(0);
    expect(output).toMatch(/log rotation/);
  });
});
