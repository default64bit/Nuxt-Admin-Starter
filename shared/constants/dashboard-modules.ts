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
  /** The one key that gates the module. */
  permission: PermissionKey;
  widths: readonly DashboardWidth[];
  defaultWidth: DashboardWidth;
  /** The ranges the module offers (empty for a module with no period figures). */
  ranges: readonly ModuleRangeKey[];
  defaultRange: ModuleRangeKey | null;
  /** Part of the computed default layout. */
  inDefaultLayout: boolean;
  preview: PreviewKind;
}

export const NEW_ACCOUNTS_KEY = "new-accounts";

export const DASHBOARD_MODULES = [
  { key: NEW_ACCOUNTS_KEY, permission: "view-users", widths: ["third", "half"], defaultWidth: "third", ranges: MODULE_RANGE_KEYS, defaultRange: "last-30-days", inDefaultLayout: true, preview: "sparkline" },
] as const satisfies readonly DashboardModuleDefinition[];

export type DashboardModuleKey = (typeof DASHBOARD_MODULES)[number]["key"];
export const DASHBOARD_MODULE_KEYS = DASHBOARD_MODULES.map((module) => module.key) as DashboardModuleKey[];
/** A layout holds each registered module at most once, so the limit is the registry length. */
export const DASHBOARD_MODULE_LIMIT = DASHBOARD_MODULES.length;

const BY_KEY: ReadonlyMap<string, DashboardModuleDefinition> = new Map<string, DashboardModuleDefinition>(DASHBOARD_MODULES.map((module) => [module.key, module]));
export const dashboardModule = (key: string): DashboardModuleDefinition | undefined => BY_KEY.get(key);

/** The key of a module's title message: `new-accounts` is `admin.dashboard.modules.newAccounts`. */
export const moduleTitleKey = (moduleKey: string) => `admin.dashboard.modules.${moduleKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())}`;
