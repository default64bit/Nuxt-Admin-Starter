import { MODULE_RANGE_KEYS, type ModuleRangeKey } from "./analytics";
import type { PermissionKey } from "./permissions";

/**
 * The Dashboard module registry (`.specs/admin-dashboard/spec.md` "Modules"): the single registration point. An entry
 * carries the key, the one Permission that gates the module, the allowed widths and default width, the offered ranges
 * and default range, whether it is in the computed default layout, and its sample preview kind. The module limit is the
 * length of this list, and the default order is the order of this list.
 *
 * A Project adds a module with one entry here plus its other pieces. Each piece is a lookup typed by `DashboardModuleKey`
 * (the payload schema in `shared/schemas/admin-dashboard.ts`, the loader in `server/services/admin-dashboard.service.ts`,
 * the component in `app/components/admin/dashboard/module-components.ts`), so a missing one is a type error. The colour
 * variable (`app/assets/css/tailwind.css`) and the fa/en title (`admin.dashboard.modules.*`) are checked by
 * `tests/unit/shared/dashboard-modules.test.ts`.
 */
export const DASHBOARD_WIDTHS = ["third", "half", "full"] as const;
export type DashboardWidth = (typeof DASHBOARD_WIDTHS)[number];

/** The shapes a Choose modules sample can draw. */
export const PREVIEW_KINDS = ["attention", "bars", "pipeline", "sparkline", "figures", "rates", "ranking"] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

export interface DashboardModuleDefinition {
  key: string;
  /** The one key that gates the module; `null` for a module every signed-in User may open (its content is gated row by row). */
  permission: PermissionKey | null;
  widths: readonly DashboardWidth[];
  defaultWidth: DashboardWidth;
  /** The ranges the module offers (empty for a module with no period figures). */
  ranges: readonly ModuleRangeKey[];
  defaultRange: ModuleRangeKey | null;
  /** Part of the computed default layout. */
  inDefaultLayout: boolean;
  preview: PreviewKind;
  /** Always first in a layout: cannot be removed or moved (only Needs attention). */
  fixed?: true;
}

// demo-ticket:start
/** A per-day trend needs more than one day, so the one-day presets are not offered. */
const DEMO_PER_DAY_RANGES = ["last-7-days", "last-30-days", "this-month", "last-month"] as const satisfies readonly ModuleRangeKey[];
// demo-ticket:end

export const NEEDS_ATTENTION_KEY = "needs-attention";
export const NEW_ACCOUNTS_KEY = "new-accounts";
// demo-ticket:start
export const DEMO_TICKETS_BY_STATUS_KEY = "demo-tickets-by-status";
export const DEMO_TICKETS_PER_DAY_KEY = "demo-tickets-per-day";
// demo-ticket:end

export const DASHBOARD_MODULES = [
  { key: NEEDS_ATTENTION_KEY, permission: null, widths: ["third", "half", "full"], defaultWidth: "half", ranges: [], defaultRange: null, inDefaultLayout: true, preview: "attention", fixed: true },
  // demo-ticket:start
  { key: DEMO_TICKETS_BY_STATUS_KEY, permission: "view-demo-tickets", widths: ["third", "half"], defaultWidth: "half", ranges: [], defaultRange: null, inDefaultLayout: true, preview: "pipeline" },
  { key: DEMO_TICKETS_PER_DAY_KEY, permission: "view-demo-tickets", widths: ["half", "full"], defaultWidth: "full", ranges: DEMO_PER_DAY_RANGES, defaultRange: "last-30-days", inDefaultLayout: true, preview: "bars" },
  // demo-ticket:end
  { key: NEW_ACCOUNTS_KEY, permission: "view-users", widths: ["third", "half"], defaultWidth: "third", ranges: MODULE_RANGE_KEYS, defaultRange: "last-30-days", inDefaultLayout: true, preview: "sparkline" },
] as const satisfies readonly DashboardModuleDefinition[];

export type DashboardModuleKey = (typeof DASHBOARD_MODULES)[number]["key"];
export const DASHBOARD_MODULE_KEYS = DASHBOARD_MODULES.map((module) => module.key) as DashboardModuleKey[];
/** A layout holds each registered module at most once, so the limit is the registry length. */
export const DASHBOARD_MODULE_LIMIT = DASHBOARD_MODULES.length;

const BY_KEY: ReadonlyMap<string, DashboardModuleDefinition> = new Map<string, DashboardModuleDefinition>(DASHBOARD_MODULES.map((module) => [module.key, module]));
/** The module that stays first in every layout and cannot be removed or moved. */
export const FIXED_FIRST_KEY = DASHBOARD_MODULES.find((module) => "fixed" in module)?.key ?? null;

export const dashboardModule = (key: string): DashboardModuleDefinition | undefined => BY_KEY.get(key);

/** The key of a module's title message: `new-accounts` is `admin.dashboard.modules.newAccounts`. */
export const moduleTitleKey = (moduleKey: string) => `admin.dashboard.modules.${moduleKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())}`;
