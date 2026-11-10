import type { Component } from "vue";
import type { DashboardModuleKey } from "~~/shared/constants/dashboard-modules";
import NewAccountsModule from "./NewAccountsModule.vue";

/**
 * The component of every Dashboard module, keyed by module key. A lookup typed by the registry, so a registered
 * module without a component is a type error. A component takes the `index` prop (its place in the grid, for the
 * staggered entrance).
 */
export const MODULE_COMPONENTS = {
  "new-accounts": NewAccountsModule,
} as const satisfies Record<DashboardModuleKey, Component>;
