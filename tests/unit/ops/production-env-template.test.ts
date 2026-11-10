// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// deploy/production.env.example is what an operator copies to the VPS (docs/architecture/vps-runbook.md). It must define
// every variable the production Compose stack and the production guards require, and stay placeholder-only.
const template = readFileSync("deploy/production.env.example", "utf8");
const keys = new Set([...template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]));
const value = (key: string) => new RegExp(`^${key}=(.*)$`, "m").exec(template)?.[1];

describe("production environment template", () => {
  it("defines every variable the production Compose stack requires", () => {
    const required = ["compose.yaml", "compose.prod.yaml"].flatMap((file) => [...readFileSync(file, "utf8").matchAll(/\$\{([A-Z][A-Z0-9_]*):\?/g)].map((match) => match[1]!));
    // Set per release by `just deploy`, never stored.
    const missing = [...new Set(required)].filter((key) => key !== "APP_IMAGE_TAG" && !keys.has(key));
    expect(missing).toEqual([]);
  });

  it("selects production, lists the pieces and the keys the deploy guards read, and holds only placeholders", () => {
    expect(value("NUXT_APP_ENV")).toBe("production");
    expect(value("COMPOSE_PROFILES")).toBeDefined();
    for (const key of ["DEPLOY_STATE_DIR", "SITE_DOMAIN", "ACME_EMAIL", "NUXT_PUBLIC_SITE_URL"]) expect(keys.has(key), key).toBe(true);
    expect(value("NUXT_SESSION_PASSWORD")).toMatch(/^replace-with-/);
    expect(value("POSTGRES_PASSWORD")).toMatch(/^change-me-/);
    expect(value("NUXT_PUBLIC_SITE_URL")).toContain("example.com");
    expect(template).not.toMatch(/^DEPLOY_APPROVED=/m);
  });
});
