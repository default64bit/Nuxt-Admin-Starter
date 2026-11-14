import { ADMIN_NAV, ADMIN_USER_MENU_LINKS, type AdminNavItem } from "~~/shared/constants/admin-nav";
import { currentNavItem, visibleNavGroups } from "~~/shared/utils/admin-nav";
import { localizedPath } from "~~/shared/utils/locale-path";

/** Route names the router actually has, with Nuxt i18n's locale suffix (`admin-users___fa`) removed. */
function useAvailableRoutes() {
  const router = useRouter();
  return computed(() => new Set(router.getRoutes().flatMap((r) => (typeof r.name === "string" ? [r.name.replace(/___\w+$/, "")] : []))));
}

/**
 * The side menu's state: declared items filtered by the session's Permissions (UX only) and by the router (a page
 * is "available" when its route exists; never a hand-flipped flag).
 */
export function useAdminNav() {
  const route = useRoute();
  const { locale } = useI18n();
  const { session } = useAuthSession();

  const availableRoutes = useAvailableRoutes();
  const permissions = computed(() => (session.value?.loggedIn ? (session.value.user?.permissions ?? []) : []));
  const groups = computed(() => visibleNavGroups(ADMIN_NAV, { permissions: permissions.value, availableRoutes: availableRoutes.value }));
  const current = computed<AdminNavItem | null>(() => currentNavItem(ADMIN_NAV, route.path));
  const hrefFor = (item: { path: string }) => localizedPath(item.path, locale.value === "en" ? "en" : "fa");

  return { groups, current, hrefFor };
}

/** The user-menu links whose pages exist. */
export function useAdminUserMenuLinks() {
  const { locale } = useI18n();
  const availableRoutes = useAvailableRoutes();
  return computed(() =>
    ADMIN_USER_MENU_LINKS.filter((link) => availableRoutes.value.has(link.routeName)).map((link) => ({
      ...link,
      href: localizedPath(link.path, locale.value === "en" ? "en" : "fa"),
    })),
  );
}
