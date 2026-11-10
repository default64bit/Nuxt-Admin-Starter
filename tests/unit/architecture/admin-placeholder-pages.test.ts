// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV } from "~~/shared/constants/admin-nav";
import { ADMIN_NAV_ICONS } from "~/components/admin/admin-nav-icons";

const root = join(__dirname, "../../..");
const pagesDir = join(root, "app/pages");

/** The page file for a nav item under the Nuxt file convention: `admin/<segment>.vue` or `admin/<segment>/index.vue`. */
function pageFile(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  const flat = join(pagesDir, `${segments.join("/")}.vue`);
  const nested = join(pagesDir, segments.join("/"), "index.vue");
  return [flat, nested].find((file) => existsSync(file)) ?? null;
}

describe("admin nav destinations have a page", () => {
  for (const item of ADMIN_NAV) {
    it(`${item.key} has a page file at ${item.path}`, () => {
      expect(pageFile(item.path), `no page for ${item.path}`).not.toBeNull();
    });

    it(`${item.key} declares the nav entry's permission in its page meta`, () => {
      const file = pageFile(item.path);
      if (!file || item.permission === null) return;
      const source = readFileSync(file, "utf8");
      expect(source).toContain(`permission: "${item.permission}"`);
    });

    it(`${item.key} has an icon`, () => {
      expect(ADMIN_NAV_ICONS[item.key], `no icon for ${item.key}`).toBeDefined();
    });
  }
});

describe("admin parent route", () => {
  it("applies the admin middleware and layout once, to every child page", () => {
    const source = readFileSync(join(pagesDir, "admin.vue"), "utf8");
    expect(source).toContain('middleware: "admin"');
    expect(source).toContain('layout: "admin"');
  });
});
