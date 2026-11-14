import type { Component } from "vue";
import type { DashboardModuleKey } from "~~/shared/constants/dashboard-modules";
import NeedsAttentionModule from "./NeedsAttentionModule.vue";
import NewAccountsModule from "./NewAccountsModule.vue";
// demo-ticket:start
import DemoTicketsByStatusModule from "~/components/demo-ticket/DemoTicketsByStatusModule.vue";
import DemoTicketsPerDayModule from "~/components/demo-ticket/DemoTicketsPerDayModule.vue";
// demo-ticket:end

/**
 * The component of every Dashboard module, keyed by module key. A lookup typed by the registry, so a registered
 * module without a component is a type error. A component takes the `index` prop (its place in the grid, for the
 * staggered entrance).
 */
export const MODULE_COMPONENTS = {
  "needs-attention": NeedsAttentionModule,
  // demo-ticket:start
  "demo-tickets-by-status": DemoTicketsByStatusModule,
  "demo-tickets-per-day": DemoTicketsPerDayModule,
  // demo-ticket:end
  "new-accounts": NewAccountsModule,
} as const satisfies Record<DashboardModuleKey, Component>;
