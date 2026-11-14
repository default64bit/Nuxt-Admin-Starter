// Starter-only (starter-meta): `just first-run` deletes tests/starter.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseRepoRef, renameProject, run, setEnvKey } from "../../scripts/starter/first-run";

describe("first-run", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture(files: Record<string, string> = {}): string {
    const root = mkdtempSync(join(tmpdir(), "first-run-"));
    roots.push(root);
    const all: Record<string, string> = {
      "i18n/locales/en.json": JSON.stringify({ app: { name: "Starter Panel" } }),
      "i18n/locales/fa.json": JSON.stringify({ app: { name: "پنل استارتر" } }),
      "compose.yaml": "name: nuxt-admin-starter\nimage: ghcr.io/default64bit/nuxt-admin-starter/app\n",
      "docs/guide.md": "Repo default64bit/Nuxt-Admin-Starter, Starter Panel / پنل استارتر.\n",
      "ops/systemd/nuxt-admin-starter-autodeploy.timer": "Unit=nuxt-admin-starter-autodeploy.service\n",
      "CHANGELOG.md": "([#1](https://github.com/default64bit/Nuxt-Admin-Starter/pull/1)) nuxt-admin-starter\n",
      LICENSE: "Copyright (c) Kasra (default64bit)\n",
      "docs/starter.md": "# Working on the Starter\n",
      "README.md": "# Starter Panel\n",
      "scripts/starter/release.ts": "x",
      "tests/starter/a.test.ts": "x",
      ".github/workflows/starter-release.yml": "x",
      ".env.example": "COMPOSE_PROFILES=media,edge,backup\nNUXT_SESSION_PASSWORD=change-me-xyz\nNUXT_ADMIN_CHANNEL_PUSH_ENABLED=true\nDEFAULT_ADMIN_PHONE=\n",
      "deploy/production.env.example": "COMPOSE_PROFILES=media,edge,backup\nNUXT_ADMIN_CHANNEL_PUSH_ENABLED=true\n",
      "AGENTS.md": "keep\n<!-- starter-meta:start -->\nStarter only\n<!-- starter-meta:end -->\nend\n",
      ".starter-release": "v0.1.0\n",
      ...files,
    };
    for (const [rel, text] of Object.entries(all)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return root;
  }
  const read = (root: string, rel: string) => readFileSync(join(root, rel), "utf8");
  const names = { nameEn: "Acme Admin", nameFa: "پنل آکمه", slug: "acme-admin" };

  it("parses ssh and https remotes", () => {
    expect(parseRepoRef("git@github.com:Acme/Panel.git\n")).toEqual({ owner: "Acme", repo: "Panel" });
    expect(parseRepoRef("https://github.com/Acme/Panel")).toEqual({ owner: "Acme", repo: "Panel" });
  });

  it("replaces the slug, repo reference and both display names, renames slug-named files and spares the changelog and LICENSE", () => {
    const root = fixture();
    renameProject(root, names, { owner: "Acme", repo: "Panel" });
    expect(read(root, "compose.yaml")).toBe("name: acme-admin\nimage: ghcr.io/acme/panel/app\n");
    expect(read(root, "docs/guide.md")).toBe("Repo Acme/Panel, Acme Admin / پنل آکمه.\n");
    expect(read(root, "ops/systemd/acme-admin-autodeploy.timer")).toBe("Unit=acme-admin-autodeploy.service\n");
    expect(existsSync(join(root, "ops/systemd/nuxt-admin-starter-autodeploy.timer"))).toBe(false);
    expect(read(root, "CHANGELOG.md")).toContain("nuxt-admin-starter");
    expect(read(root, "LICENSE")).toContain("default64bit");
    expect(read(root, "i18n/locales/en.json")).toContain("Acme Admin");
  });

  it("rejects a bad slug", () => {
    expect(() => renameProject(fixture(), { ...names, slug: "Bad Slug" }, null)).toThrow(/slug/);
  });

  it("sets and appends env keys", () => {
    expect(setEnvKey("A=1\nB=2\n", "A", "9")).toBe("A=9\nB=2\n");
    expect(setEnvKey("A=1", "C", "3")).toBe("A=1\nC=3\n");
  });

  it("refuses when the Starter maintenance doc is gone", async () => {
    const root = fixture();
    rmSync(join(root, "docs/starter.md"));
    await expect(run(["name-en=A", "name-fa=B", "slug=a"], root, () => {})).rejects.toThrow(/already set up/);
  });

  it("fails on a missing name without a terminal instead of prompting", async () => {
    await expect(run(["slug=a"], fixture(), () => {})).rejects.toThrow(/missing argument/);
  });

  it("runs end to end: pieces into the examples, local .env, Starter-only material gone, .starter-release kept", async () => {
    const root = fixture();
    const lines: string[] = [];
    await run(["name-en=Acme Admin", "name-fa=پنل آکمه", "slug=acme-admin", "profiles=media", "push=off", "admin-phone=09120000000", "admin-given-name=Ada"], root, (line) => lines.push(line));
    for (const rel of [".env.example", "deploy/production.env.example"]) {
      expect(read(root, rel)).toContain("COMPOSE_PROFILES=media\n");
      expect(read(root, rel)).toContain("NUXT_ADMIN_CHANNEL_PUSH_ENABLED=false");
    }
    expect(read(root, ".env.example")).not.toContain("09120000000");
    const env = read(root, ".env");
    expect(env).toContain("DEFAULT_ADMIN_PHONE=09120000000");
    expect(env).toContain("DEFAULT_ADMIN_GIVEN_NAME=Ada");
    expect(env).not.toContain("change-me");
    expect(lines.join("\n")).toContain("docs/optional-pieces/glitchtip.md");
    expect(lines.join("\n")).toContain("docs/optional-pieces/web-push-pwa.md");
    expect(lines.join("\n")).not.toContain("optional-pieces/media.md");
    expect(read(root, "AGENTS.md")).toBe("keep\nend\n");
    for (const gone of ["docs/starter.md", "CHANGELOG.md", "scripts/starter", "tests/starter", ".github/workflows/starter-release.yml"]) {
      expect(existsSync(join(root, gone))).toBe(false);
    }
    expect(read(root, "README.md")).toContain("# Acme Admin");
    expect(read(root, ".starter-release")).toBe("v0.1.0\n");
    expect(read(root, "LICENSE")).toContain("default64bit");
    await expect(run(["name-en=A", "name-fa=B", "slug=a"], root, () => {})).rejects.toThrow(/already set up/);
  });
});
