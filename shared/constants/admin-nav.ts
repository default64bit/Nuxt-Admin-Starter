import type { PermissionKey } from "./permissions";

// The admin menu as typed config (.specs/admin-shell/spec.md). A Project adds a destination by adding a row to
// `ADMIN_NAV`, an icon in `app/components/admin/admin-nav-icons.ts`, a hue below, a label under `admin.nav.items.*`
// in both locales, and a page at the declared route name. The menu shows an item only when the page exists and the
// User holds its Permission.

export const ADMIN_NAV_GROUPS = ["dashboard", "people", "system"] as const;
export type AdminNavGroup = (typeof ADMIN_NAV_GROUPS)[number];

export interface AdminNavItem {
  key: string;
  group: AdminNavGroup;
  order: number;
  labelKey: string;
  /** Page route name by the Nuxt convention: `admin-<segments>` for `/admin/<segments>`. */
  routeName: string;
  /** Locale-neutral path, used for the active item and the breadcrumb. */
  path: string;
  /** The one catalogue key that lets a User open the page; null only for the Dashboard, which has no page key. */
  permission: PermissionKey | null;
}

const camel = (value: string) => value.replace(/-(\w)/g, (_, char: string) => char.toUpperCase());

const item = (key: string, group: AdminNavGroup, order: number, permission: PermissionKey | null, segment = key): AdminNavItem => ({
  key,
  group,
  order,
  labelKey: `admin.nav.items.${camel(key)}`,
  routeName: segment ? `admin-${segment}` : "admin",
  path: segment ? `/admin/${segment}` : "/admin",
  permission,
});

export const ADMIN_NAV: readonly AdminNavItem[] = [
  item("dashboard", "dashboard", 0, null, ""),
  item("users", "people", 0, "view-users"),
  item("roles", "people", 1, "view-roles"),
  item("audit-log", "system", 0, "view-audit-log"),
];

/**
 * Entries of the user menu whose pages other slices build (Notification settings, My account). Like the menu they
 * show only once the page exists, so the slice that builds a page adds a row here (with `labelKey` and an icon in
 * `admin-nav-icons.ts`) and creates the file; nothing else in the menu changes.
 */
export interface AdminUserMenuLink {
  key: string;
  labelKey: string;
  routeName: string;
  path: string;
}
export const ADMIN_USER_MENU_LINKS: readonly AdminUserMenuLink[] = [
  { key: "my-account", labelKey: "admin.account.menuLabel", routeName: "admin-account", path: "/admin/account" },
];

/** The tint hue (HSL degrees) of each section's page-title tile, keyed by nav item key. */
export const ADMIN_NAV_HUES: Readonly<Record<string, number>> = {
  dashboard: 200,
  users: 260,
  roles: 285,
  "audit-log": 350,
};
/** A section without a hue of its own. */
export const DEFAULT_ADMIN_HUE = 238;

/** The hue of a section, or the default one when it has none. */
export const adminHue = (key: string | null | undefined): number => (key ? ADMIN_NAV_HUES[key] : undefined) ?? DEFAULT_ADMIN_HUE;
