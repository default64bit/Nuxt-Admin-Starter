import { ADMIN_NAV_GROUPS, type AdminNavGroup, type AdminNavItem } from "../constants/admin-nav";

export interface NavContext {
  /** `permissions` from the session read (UX only; the server is authoritative). */
  permissions: readonly string[];
  /** Route names the router actually has (locale suffix already removed). */
  availableRoutes: ReadonlySet<string>;
}

export interface NavGroupView<T extends AdminNavItem = AdminNavItem> {
  group: AdminNavGroup;
  items: T[];
}

/** Items that pass both filters, grouped in config order; a group with no visible item is omitted. */
export function visibleNavGroups<T extends AdminNavItem>(items: readonly T[], context: NavContext): NavGroupView<T>[] {
  const visible = items.filter(
    (item) =>
      (item.permission === null || context.permissions.includes(item.permission)) && context.availableRoutes.has(item.routeName),
  );
  return ADMIN_NAV_GROUPS.map((group) => ({
    group,
    items: visible.filter((item) => item.group === group).sort((a, b) => a.order - b.order),
  })).filter((view) => view.items.length > 0);
}

function barePath(path: string): string {
  const segments = (path.split(/[?#]/, 1)[0] ?? "")
    .toLowerCase()
    .split("/")
    .filter(Boolean);
  if (segments[0] === "en") segments.shift();
  return `/${segments.join("/")}`;
}

/** The item whose section the path is in (`/admin/users/42` belongs to Users); the longest match wins. */
export function currentNavItem<T extends AdminNavItem>(items: readonly T[], path: string): T | null {
  const bare = barePath(path);
  let best: T | null = null;
  for (const item of items) {
    const matches = bare === item.path || (item.path !== "/admin" && bare.startsWith(`${item.path}/`));
    if (matches && (!best || item.path.length > best.path.length)) best = item;
  }
  return best;
}

/** Translation keys of the default breadcrumb: the Dashboard is one crumb, others are Group > Item. */
export function navCrumbKeys(item: AdminNavItem): string[] {
  return item.group === "dashboard" ? [item.labelKey] : [`admin.nav.groups.${item.group}`, item.labelKey];
}
