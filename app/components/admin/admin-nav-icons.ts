import { IconHistory, IconLayoutDashboard, IconShieldLock, IconUserCircle, IconUsers } from "@tabler/icons-vue";
import type { Component } from "vue";

/**
 * The soft translucent background of a section's tint, in the hue `--admin-hue` (set inline from `adminHue()` in
 * `shared/constants/admin-nav.ts`). An arbitrary-value class, so `cn` lets it replace a component's own `bg-*`.
 */
export const ADMIN_TINT_CLASS = "bg-[hsl(var(--admin-hue)_16%_42%/33%)]";

/** Tabler icon per nav item key (kept out of `shared/` so the config stays framework-free). A Project registers its icons here. */
export const ADMIN_NAV_ICONS: Record<string, Component> = {
  dashboard: IconLayoutDashboard,
  users: IconUsers,
  roles: IconShieldLock,
  "audit-log": IconHistory,
};

/** Tabler icon per user-menu link key (`ADMIN_USER_MENU_LINKS`); a link without one gets the generic account icon. */
export const ADMIN_USER_MENU_ICONS: Record<string, Component> = {
  "my-account": IconUserCircle,
};
export const DEFAULT_USER_MENU_ICON: Component = IconUserCircle;
