import { z } from "zod";
import { MODULE_RANGE_KEYS } from "../constants/analytics";
// demo-ticket:start
import { DEMO_TICKET_STATUSES } from "../constants/demo-ticket";
// demo-ticket:end
import { DASHBOARD_WIDTHS, type DashboardModuleKey } from "../constants/dashboard-modules";

export const CHART_STYLES = ["soft", "glow", "pro"] as const;
export type ChartStyle = (typeof CHART_STYLES)[number];

export const dashboardLayoutEntrySchema = z.object({ key: z.string(), width: z.enum(DASHBOARD_WIDTHS), fill: z.boolean() });

/**
 * `GET /api/v1/admin/account/dashboard`: the arrangement the User can see (repaired), whether it is the computed
 * default, each module's range with defaults filled in, the Chart style, the version used by the Save conflict
 * check, and the module keys the picker may offer.
 */
export const dashboardPreferencesSchema = z.object({
  modules: z.array(dashboardLayoutEntrySchema),
  isDefault: z.boolean(),
  ranges: z.record(z.string(), z.enum(MODULE_RANGE_KEYS)),
  chartStyle: z.enum(CHART_STYLES),
  arrangementUpdatedAt: z.string().nullable(),
  pickerModules: z.array(z.string()),
});
export type DashboardPreferences = z.output<typeof dashboardPreferencesSchema>;

const windowSchema = z.object({ from: z.string(), to: z.string() });
const comparedSchema = z.object({ current: z.number().int(), previous: z.number().int() });
/** The part every period module answers with: its range and the window it covers and is compared with. */
const periodSchema = z.object({ range: z.enum(MODULE_RANGE_KEYS), window: windowSchema, previous: windowSchema, includesToday: z.boolean() });

/** `GET .../modules/new-accounts?range=`: accounts created in the range with the previous period's count, a daily sparkline, and every account now. */
export const newAccountsSchema = periodSchema.extend({
  newAccounts: comparedSchema,
  totalAccounts: z.number().int().min(0),
  sparkline: z.array(z.object({ day: z.string(), count: z.number().int().min(0) })),
});
export type NewAccounts = z.output<typeof newAccountsSchema>;

/**
 * `GET .../modules/needs-attention`: one row per queue the User may open (its nav-count key and the count the menu badge
 * shows). Empty when the User may open no queue, which hides the module.
 */
export const needsAttentionSchema = z.object({ rows: z.array(z.object({ key: z.string(), count: z.number().int().min(0) })).max(20) });
export type NeedsAttention = z.output<typeof needsAttentionSchema>;

// demo-ticket:start
/** `GET .../modules/demo-tickets-by-status`: how many demo tickets are in each status now (the whole pipeline, in order). */
export const demoTicketsByStatusSchema = z.object({
  statuses: z.array(z.object({ status: z.enum(DEMO_TICKET_STATUSES), count: z.number().int().min(0) })).max(DEMO_TICKET_STATUSES.length),
});
export type DemoTicketsByStatus = z.output<typeof demoTicketsByStatusSchema>;

/** `GET .../modules/demo-tickets-per-day?range=`: demo tickets created on each Tehran day of the range (zero days included). */
export const demoTicketsPerDaySchema = periodSchema.extend({
  total: z.number().int().min(0),
  days: z.array(z.object({ day: z.string(), count: z.number().int().min(0) })).max(62),
});
export type DemoTicketsPerDay = z.output<typeof demoTicketsPerDaySchema>;
// demo-ticket:end

/**
 * The payload schema of every module, keyed by module key. A lookup typed by the registry, so registering a module
 * without its schema is a type error. The loader parses its answer with it.
 */
export const MODULE_PAYLOAD_SCHEMAS = {
  "needs-attention": needsAttentionSchema,
  // demo-ticket:start
  "demo-tickets-by-status": demoTicketsByStatusSchema,
  "demo-tickets-per-day": demoTicketsPerDaySchema,
  // demo-ticket:end
  "new-accounts": newAccountsSchema,
} as const satisfies Record<DashboardModuleKey, z.ZodType>;

/** `PUT /api/v1/admin/account/dashboard/ranges/:moduleKey`. The range is checked against the module's offered ranges after the permission check (422), so its shape is left open here. */
export const moduleRangeBodySchema = z.object({ range: z.unknown() });

/** `PUT .../dashboard/chart-style`. The style is checked against the available styles (422). */
export const chartStyleBodySchema = z.object({ chartStyle: z.string() });

/**
 * `PUT .../dashboard/arrangement`: the visible modules of the Customize draft and the version the draft was loaded
 * with. The modules are checked strictly by the service (422 `invalid_layout`), so their shape is left open here.
 */
export const arrangementBodySchema = z.object({ modules: z.unknown(), expectedUpdatedAt: z.unknown() });
