// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV, ADMIN_NAV_GROUPS, ADMIN_NAV_HUES, ADMIN_USER_MENU_LINKS, DEFAULT_ADMIN_HUE, adminHue } from "~~/shared/constants/admin-nav";
import { PERMISSION_KEYS } from "~~/shared/constants/permissions";
import { currentNavItem, navCrumbKeys, visibleNavGroups } from "~~/shared/utils/admin-nav";

const root = join(__dirname, "../../..");
const locale = (name: string) => JSON.parse(readFileSync(join(root, "i18n/locales", `${name}.json`), "utf8")) as Record<string, unknown>;
const lookup = (tree: Record<string, unknown>, key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);

describe("admin nav config", () => {
  it("declares the Dashboard (no page key) plus one gated destination per page key", () => {
    expect(ADMIN_NAV.filter((item) => item.permission === null).map((item) => item.key)).toEqual(["dashboard"]);
    expect(ADMIN_NAV.map((item) => item.permission).filter(Boolean)).toEqual(["view-users", "view-roles", "view-audit-log"]);
  });

  it("has unique keys, routes and paths", () => {
    for (const field of ["key", "routeName", "path"] as const) {
      const values = ADMIN_NAV.map((item) => item[field]);
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it("only requires permission keys that exist in the catalogue", () => {
    for (const item of ADMIN_NAV) {
      if (item.permission) expect(PERMISSION_KEYS as readonly string[]).toContain(item.permission);
    }
  });

  it("puts every item in a declared group and names routes by the page convention", () => {
    for (const item of ADMIN_NAV) {
      expect(ADMIN_NAV_GROUPS).toContain(item.group);
      const segments = item.path.split("/").filter(Boolean);
      expect(segments[0]).toBe("admin");
      expect(item.routeName, item.key).toBe(segments.join("-"));
    }
  });

  it("has a label in both languages for every group, item and user-menu link", () => {
    for (const name of ["en", "fa"]) {
      const messages = locale(name);
      for (const group of ADMIN_NAV_GROUPS) expect(typeof lookup(messages, `admin.nav.groups.${group}`), `${name} group ${group}`).toBe("string");
      for (const entry of [...ADMIN_NAV, ...ADMIN_USER_MENU_LINKS]) expect(typeof lookup(messages, entry.labelKey), `${name} ${entry.labelKey}`).toBe("string");
    }
  });
});

describe("section hues", () => {
  it("gives the shipped sections their hues", () => {
    expect(ADMIN_NAV_HUES).toEqual({ dashboard: 200, users: 260, roles: 285, "audit-log": 350 });
    expect(adminHue("roles")).toBe(285);
  });

  it("falls back to the default hue for a section without one", () => {
    expect(adminHue("something-new")).toBe(DEFAULT_ADMIN_HUE);
    expect(adminHue(null)).toBe(DEFAULT_ADMIN_HUE);
    expect(adminHue(undefined)).toBe(DEFAULT_ADMIN_HUE);
  });
});

describe("visibleNavGroups", () => {
  const all = new Set(ADMIN_NAV.map((item) => item.routeName));
  const names = (groups: ReturnType<typeof visibleNavGroups>) => groups.flatMap((group) => group.items.map((item) => item.key));

  it("shows an item only when its page exists and the Permission is held, with its group", () => {
    const groups = visibleNavGroups(ADMIN_NAV, { permissions: ["view-users"], availableRoutes: all });
    expect(groups.map((group) => group.group)).toEqual(["dashboard", "people"]);
    expect(names(groups)).toEqual(["dashboard", "users"]);
  });

  it("shows the Dashboard alone, with no other group, to a User holding no page Permission", () => {
    expect(names(visibleNavGroups(ADMIN_NAV, { permissions: [], availableRoutes: all }))).toEqual(["dashboard"]);
  });

  it("hides an item whose page is not built even when the Permission is held", () => {
    const groups = visibleNavGroups(ADMIN_NAV, { permissions: [...PERMISSION_KEYS], availableRoutes: new Set(["admin", "admin-users"]) });
    expect(names(groups)).toEqual(["dashboard", "users"]);
  });

  it("orders groups and items by the config", () => {
    const groups = visibleNavGroups(ADMIN_NAV, { permissions: [...PERMISSION_KEYS], availableRoutes: all });
    expect(groups.map((group) => group.group)).toEqual([...ADMIN_NAV_GROUPS]);
    expect(names(groups)).toEqual(["dashboard", "users", "roles", "audit-log"]);
  });
});

describe("currentNavItem and navCrumbKeys", () => {
  it("finds the item for a path in either locale, ignoring case and a trailing slash, and a deeper page's section", () => {
    expect(currentNavItem(ADMIN_NAV, "/en/admin/roles/")?.key).toBe("roles");
    expect(currentNavItem(ADMIN_NAV, "/ADMIN/users")?.key).toBe("users");
    expect(currentNavItem(ADMIN_NAV, "/admin")?.key).toBe("dashboard");
    expect(currentNavItem(ADMIN_NAV, "/admin/users/42/edit")?.key).toBe("users");
    expect(currentNavItem(ADMIN_NAV, "/admin/unknown")).toBeNull();
  });

  it("is a single crumb for the Dashboard and Group > Item otherwise", () => {
    const dashboard = ADMIN_NAV.find((item) => item.key === "dashboard")!;
    const users = ADMIN_NAV.find((item) => item.key === "users")!;
    expect(navCrumbKeys(dashboard)).toEqual(["admin.nav.items.dashboard"]);
    expect(navCrumbKeys(users)).toEqual(["admin.nav.groups.people", "admin.nav.items.users"]);
  });
});
