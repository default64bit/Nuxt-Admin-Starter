// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Certificate policy of the Caddyfile, served by the stock Caddy base image. Runs in `deploy-automation` only
// (`just test-compose` sets INFRA_TESTS=1); the adapt assertions also need Docker.
const infra = process.env.INFRA_TESTS === "1";
const hasDocker = infra && spawnSync("docker", ["version"]).status === 0;
const caddyfile = readFileSync("Caddyfile", "utf8");
const directives = caddyfile.replace(/^\s*#.*\n/gm, "");
const image = readFileSync("ops/caddy/base-images.txt", "utf8")
  .split("\n")
  .find((line) => /^caddy:\S+@sha256:[0-9a-f]{64}$/.test(line.trim()))!
  .trim();

describe.skipIf(!infra)("Caddyfile certificates", () => {
  it("issues with Caddy's own HTTP-01/TLS-ALPN-01 challenges, with no DNS provider or API key", () => {
    expect(directives).not.toMatch(/^\s*dns /m);
    expect(directives).not.toMatch(/disable_(http|tlsalpn)_challenge/);
  });

  it("uses Let's Encrypt only, selected globally by CADDY_ACME_CA, with no ZeroSSL fallback", () => {
    expect(directives).toMatch(/^\{\n\temail \{\$ACME_EMAIL\}\n\n?\tacme_ca \{\$CADDY_ACME_CA\}\n\}/);
    expect(directives).not.toMatch(/zerossl|issuer |cert_issuer|^\s*tls /im);
  });
});

describe.skipIf(!hasDocker)("Caddyfile certificates, adapted by the pinned Caddy image", () => {
  function adapt(ca: string, extraEnv: Record<string, string> = {}) {
    const env = { ACME_EMAIL: "ops@app.test", SITE_DOMAIN: "app.test", CADDY_ACME_CA: ca, ...extraEnv };
    const args = Object.entries(env).flatMap(([name, value]) => ["-e", `${name}=${value}`]);
    return spawnSync(
      "docker",
      ["run", "--rm", ...args, "-v", `${resolve("Caddyfile")}:/etc/caddy/Caddyfile:ro`, "-v", `${resolve("ops/caddy/pieces")}:/etc/caddy/pieces:ro`, image, "caddy", "adapt", "--config", "/etc/caddy/Caddyfile"],
      { encoding: "utf8", timeout: 180_000 },
    );
  }

  it("configures exactly one ACME issuer, the selected Let's Encrypt directory, for the site and www hosts only", () => {
    for (const ca of ["https://acme-v02.api.letsencrypt.org/directory", "https://acme-staging-v02.api.letsencrypt.org/directory"]) {
      const result = adapt(ca);
      expect(result.status, result.stderr).toBe(0);
      const config = JSON.parse(result.stdout);
      const policies = config.apps.tls.automation.policies as Array<{ issuers: Array<{ module: string; ca: string }> }>;
      expect(policies.flatMap((policy) => policy.issuers)).toEqual([expect.objectContaining({ module: "acme", ca })]);
      const hosts = (config.apps.http.servers.srv0.routes as Array<{ match: Array<{ host: string[] }> }>).flatMap((route) => route.match.flatMap((m) => m.host));
      expect(hosts.sort()).toEqual(["app.test", "www.app.test"]);
    }
  });

  it("refuses an empty CADDY_ACME_CA instead of falling back to Caddy's default issuers", () => {
    const result = adapt("");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("acme_ca");
  });
});
