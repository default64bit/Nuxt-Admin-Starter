// @vitest-environment node
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// ACME and domain guards of the edge proxy. They only run in `deploy-automation` (`just test-compose` sets INFRA_TESTS=1).
const valid = {
  COMPOSE_PROFILES: "media,edge,backup",
  SITE_DOMAIN: "admin.example.org",
  ACME_EMAIL: "ops@example.org",
  NUXT_PUBLIC_SITE_URL: "https://admin.example.org",
  MEDIA_DOMAIN: "media.example.org",
};

function guards(env: Record<string, string>) {
  const result = spawnSync("bash", ["scripts/ops/edge-guards.sh"], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe.skipIf(process.env.INFRA_TESTS !== "1")("edge guards", () => {
  it("pass for a real domain, e-mail and matching public URL", () => {
    expect(guards(valid).status).toBe(0);
  });

  it("reject placeholders, a www apex, a mismatched public URL and a missing media host when the piece is on", () => {
    expect(guards({ ...valid, SITE_DOMAIN: "app.example.com" }).output).toMatch(/real production hostname/);
    expect(guards({ ...valid, SITE_DOMAIN: "www.admin.example.org" }).output).toMatch(/without a www\./);
    expect(guards({ ...valid, ACME_EMAIL: "admin@example.com" }).output).toMatch(/ACME_EMAIL/);
    expect(guards({ ...valid, NUXT_PUBLIC_SITE_URL: "http://admin.example.org" }).output).toMatch(/NUXT_PUBLIC_SITE_URL=https:\/\/admin\.example\.org/);
    expect(guards({ ...valid, MEDIA_DOMAIN: "" }).output).toMatch(/MEDIA_DOMAIN/);
    expect(guards({ ...valid, MEDIA_DOMAIN: "" }).status).not.toBe(0);
  });

  it("are skipped with the edge profile Off, however wrong the domain settings are", () => {
    const off = guards({ COMPOSE_PROFILES: "media,backup", SITE_DOMAIN: "app.example.com", ACME_EMAIL: "admin@example.com" });
    expect(off.status).toBe(0);
    expect(off.output).toContain("Edge profile is Off");
    expect(guards({ COMPOSE_PROFILES: "" }).status).toBe(0);
  });
});
