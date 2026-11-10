// Starter-only (starter-meta): `just first-run` deletes tests/starter.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { demoRemove } from "../../scripts/demo/demo-remove";
import { stripMarkedBlocks } from "../../scripts/demo/strip-markers";

describe("stripMarkedBlocks", () => {
  it("removes blocks in every comment syntax and keeps surrounding lines", () => {
    const text = [
      "keep 1",
      "  // demo-ticket:start",
      "  drop",
      "  // demo-ticket:end",
      "# demo-ticket:start",
      "drop",
      "# demo-ticket:end",
      "<!-- demo-ticket:start -->",
      "<p>drop</p>",
      "<!-- demo-ticket:end -->",
      "/* demo-ticket:start */",
      "drop",
      "/* demo-ticket:end */",
      "keep 2",
    ].join("\n");
    expect(stripMarkedBlocks(text, "demo-ticket")).toBe("keep 1\nkeep 2");
  });

  it("takes the marker name as a parameter and leaves other markers and prose alone", () => {
    const text = "// starter-meta:start\nx\n// starter-meta:end\nProse about `demo-ticket:start` / `demo-ticket:end` markers.\n// demo-ticket:start\ny\n// demo-ticket:end";
    expect(stripMarkedBlocks(text, "starter-meta")).toBe(
      "Prose about `demo-ticket:start` / `demo-ticket:end` markers.\n// demo-ticket:start\ny\n// demo-ticket:end",
    );
  });

  it("rejects unbalanced blocks", () => {
    expect(() => stripMarkedBlocks("// demo-ticket:start\nx", "demo-ticket")).toThrow(/without an end/);
    expect(() => stripMarkedBlocks("x\n// demo-ticket:end", "demo-ticket")).toThrow(/without a start/);
    expect(() => stripMarkedBlocks("// demo-ticket:start\n// demo-ticket:start", "demo-ticket")).toThrow(/nested/);
  });
});

describe("demoRemove", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture(): string {
    const root = mkdtempSync(join(tmpdir(), "demo-remove-"));
    roots.push(root);
    const write = (path: string, content: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    };
    write("shared/constants/nav.ts", "a\n// demo-ticket:start\nb\n// demo-ticket:end\nc\n");
    write("shared/constants/demo-ticket.ts", "demo\n");
    write("app/pages/admin/demo-tickets/index.vue", "<template />\n");
    write("i18n/locales/demo-ticket.en.json", "{}\n");
    write(".specs/demo-tickets/spec.md", "# spec\n");
    write("server/database/migrations/0000_baseline.sql", "base\n");
    write("server/database/migrations/0001_demo-tickets.sql", "demo\n");
    write("server/database/migrations/meta/0000_snapshot.json", "{}");
    write("server/database/migrations/meta/0001_snapshot.json", "{}");
    write(
      "server/database/migrations/meta/_journal.json",
      JSON.stringify({ version: "7", entries: [{ idx: 0, tag: "0000_baseline" }, { idx: 1, tag: "0001_demo-tickets" }] }),
    );
    return root;
  }

  it("drops the demo migration before a deploy and points at dev-reset", () => {
    const root = fixture();
    const messages = demoRemove({ root, deployed: false });
    expect(readFileSync(join(root, "shared/constants/nav.ts"), "utf8")).toBe("a\nc\n");
    for (const gone of ["shared/constants/demo-ticket.ts", "app/pages/admin/demo-tickets", "i18n/locales/demo-ticket.en.json", ".specs/demo-tickets"]) {
      expect(existsSync(join(root, gone)), gone).toBe(false);
    }
    const migrations = join(root, "server/database/migrations");
    expect(existsSync(join(migrations, "0001_demo-tickets.sql"))).toBe(false);
    expect(existsSync(join(migrations, "meta/0001_snapshot.json"))).toBe(false);
    expect(existsSync(join(migrations, "0000_baseline.sql"))).toBe(true);
    expect(JSON.parse(readFileSync(join(migrations, "meta/_journal.json"), "utf8")).entries).toEqual([{ idx: 0, tag: "0000_baseline" }]);
    expect(messages.join("\n")).toContain("just dev-reset");
  });

  it("keeps the migration and generates a drop migration when deployed", () => {
    const root = fixture();
    const generated: string[] = [];
    demoRemove({ root, deployed: true, generateMigration: (dir) => generated.push(dir) });
    expect(generated).toEqual([root]);
    const migrations = join(root, "server/database/migrations");
    expect(existsSync(join(migrations, "0001_demo-tickets.sql"))).toBe(true);
    expect(existsSync(join(migrations, "meta/0001_snapshot.json"))).toBe(true);
    expect(existsSync(join(root, "shared/constants/demo-ticket.ts"))).toBe(false);
  });
});
