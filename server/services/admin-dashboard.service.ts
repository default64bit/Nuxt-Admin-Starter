import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { z } from "zod";
import * as schema from "../database/schema";
import type { Db } from "../database/types";
import { MODULE_RANGE_KEYS, type ModuleRangeKey } from "../../shared/constants/analytics";
import { DASHBOARD_MODULES, NEW_ACCOUNTS_KEY, dashboardModule, type DashboardModuleDefinition, type DashboardModuleKey } from "../../shared/constants/dashboard-modules";
import { CHART_STYLES, MODULE_PAYLOAD_SCHEMAS, type ChartStyle, type DashboardPreferences } from "../../shared/schemas/admin-dashboard";
import { dayIso, dayNumber, resolveRange, startOfDay } from "../../shared/utils/business-calendar";
import { defaultLayout, isModuleVisible, mergeHiddenEntries, repairLayout, validateArrangement, visibleEntries } from "../../shared/utils/dashboard-layout";
import { accountsCreatedByDay, countAccounts, countAccountsCreated } from "../repositories/account-analytics.repository";
import { findPreferences, saveArrangement, upsertChartStyle, upsertRange } from "../repositories/dashboard-preferences.repository";
import { analyticsCache, analyticsTtl, type AnalyticsCache } from "../utils/analytics-cache";
import { DomainError } from "../utils/domain-errors";
import type { AdminActor } from "./authorization";

const isRange = (value: unknown): value is ModuleRangeKey => typeof value === "string" && (MODULE_RANGE_KEYS as readonly string[]).includes(value);
const isStyle = (value: unknown): value is ChartStyle => typeof value === "string" && (CHART_STYLES as readonly string[]).includes(value);

/**
 * The signed-in User's Dashboard (`GET /api/v1/admin/account/dashboard`): the stored arrangement repaired leniently
 * (unknown keys dropped), or the computed default when nothing is stored, then filtered to the modules the User may see.
 * Ranges come back with each offered module's default filled in; a stored range the module no longer offers falls back
 * to its default. Only the caller's own row is ever read.
 */
export async function getDashboard({ db }: { db: Db }, actor: AdminActor): Promise<DashboardPreferences> {
  const row = await findPreferences(db, actor.userId);
  const stored = row?.arrangement ?? null;
  const modules = visibleEntries(stored === null ? defaultLayout() : repairLayout(stored), actor.has);
  const storedRanges = row?.ranges && typeof row.ranges === "object" ? (row.ranges as Record<string, unknown>) : {};
  const ranges: Record<string, ModuleRangeKey> = {};
  for (const definition of DASHBOARD_MODULES as readonly DashboardModuleDefinition[]) {
    if (definition.defaultRange === null || !isModuleVisible(definition.key, actor.has)) continue;
    const range = storedRanges[definition.key];
    ranges[definition.key] = isRange(range) && definition.ranges.includes(range) ? range : definition.defaultRange;
  }
  return {
    modules,
    isDefault: stored === null,
    ranges,
    chartStyle: isStyle(row?.chartStyle) ? row.chartStyle : "soft",
    arrangementUpdatedAt: row?.arrangementUpdatedAt ? new Date(row.arrangementUpdatedAt).toISOString() : null,
    pickerModules: DASHBOARD_MODULES.filter((module) => isModuleVisible(module.key, actor.has)).map((module) => module.key),
  };
}

/** Postgres cancels a statement over `statement_timeout` with SQLSTATE 57014; drivers may wrap it as a `cause`. */
const isStatementTimeout = (error: unknown): boolean => {
  for (let e = error as { code?: string; cause?: unknown } | undefined, depth = 0; e && depth < 4; e = e.cause as typeof e, depth++) if (e.code === "57014") return true;
  return false;
};

/** Connections a module's independent queries may use at once. */
const ANALYTICS_POOL_SIZE = 8;
const analyticsPools = new WeakMap<object, Db>();

/**
 * The analytics reads' own pool over the same server: every connection carries `statement_timeout = 5s`, so a module's
 * independent queries run in parallel on separate connections and each is cut off at 5 s (ADR-0024). Built once per
 * database handle.
 */
function analyticsDb(db: Db): Db | null {
  const client = (db as unknown as { $client?: pg.Pool }).$client;
  if (!client || typeof client.connect !== "function" || !client.options) return null;
  const cached = analyticsPools.get(client);
  if (cached) return cached;
  const pool = new pg.Pool({ ...client.options, max: ANALYTICS_POOL_SIZE, statement_timeout: 5000 });
  pool.on("error", () => undefined);
  const analytics = drizzle(pool, { schema, casing: "snake_case" });
  analyticsPools.set(client, analytics);
  return analytics;
}

/**
 * Runs an analytics read under a 5 s statement timeout. A timeout fails only the module asking: `503 analytics_timeout`,
 * which the module shows as "Couldn't load" with Retry. The queries of one module may run in parallel (each on its own
 * connection); a database handle that is not a pool falls back to one transaction with `SET LOCAL`.
 */
export async function withAnalyticsTimeout<T>(db: Db, run: (reads: Db) => Promise<T>): Promise<T> {
  try {
    const reads = analyticsDb(db);
    if (reads) return await run(reads);
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      return run(tx as unknown as Db);
    });
  } catch (error) {
    if (isStatementTimeout(error)) throw new DomainError(503, "Service Unavailable", "analytics_timeout");
    throw error;
  }
}

const RANGE_SEPARATOR = "|";

interface ModuleDeps {
  db: Db;
  cache?: AnalyticsCache;
  now?: () => Date;
}

/** The range a period module reads: the User's choice when the module offers it, else its default, with the window it resolves to. */
function resolveModuleRange(moduleKey: string, rangeParam: unknown, now: Date) {
  const definition = dashboardModule(moduleKey)!;
  const key = isRange(rangeParam) && definition.ranges.includes(rangeParam) ? rangeParam : definition.defaultRange!;
  const resolved = resolveRange(key, now);
  const common = {
    range: key,
    window: { from: resolved.window.from.toISOString(), to: resolved.window.to.toISOString() },
    previous: { from: resolved.previous.from.toISOString(), to: resolved.previous.to.toISOString() },
    includesToday: resolved.includesToday,
  };
  return { key, resolved, common, cacheKey: [moduleKey, key, resolved.window.from.toISOString(), "auto"].join(RANGE_SEPARATOR) };
}

/**
 * New accounts: accounts created in the range with the previous period's count and a daily sparkline, and the total
 * now (read live, never cached). The sparkline covers at least 7 days ending with the range's last day, so a one-day
 * range still draws a line.
 */
async function loadNewAccounts({ db, cache = analyticsCache, now = () => new Date() }: ModuleDeps, rangeParam: unknown) {
  const { resolved, common, cacheKey } = resolveModuleRange(NEW_ACCOUNTS_KEY, rangeParam, now());
  const [period, total] = await Promise.all([
    cache.remember(cacheKey, analyticsTtl(resolved.includesToday), async () => {
      const last = dayNumber(resolved.lastDay);
      const first = Math.min(dayNumber(resolved.firstDay), last - 6);
      const [current, previous, byDay] = await withAnalyticsTimeout(db, (tx) =>
        Promise.all([countAccountsCreated(tx, resolved.window), countAccountsCreated(tx, resolved.previous), accountsCreatedByDay(tx, { from: startOfDay(first), to: resolved.window.to })]),
      );
      const counts = new Map(byDay.map((entry) => [entry.day, entry.count]));
      const sparkline = Array.from({ length: last - first + 1 }, (_, i) => ({ day: dayIso(first + i), count: counts.get(dayIso(first + i)) ?? 0 }));
      return { newAccounts: { current, previous }, sparkline };
    }),
    withAnalyticsTimeout(db, (tx) => countAccounts(tx)),
  ]);
  return { ...common, ...period, totalAccounts: total };
}

type ModuleLoader = (deps: ModuleDeps, rangeParam: unknown) => Promise<unknown>;

/**
 * The loader of every module, keyed by module key: a lookup typed by the registry, so registering a module without its
 * loader is a type error. The permission was checked before a loader runs, so a loader only computes. An entry that
 * can be cached does so through `deps.cache`, keyed by module + range + window.
 */
export const MODULE_LOADERS = {
  "new-accounts": loadNewAccounts,
} as const satisfies Record<DashboardModuleKey, ModuleLoader>;

/**
 * One module's data (`GET /api/v1/admin/analytics/modules/:moduleKey`). `404` for a key that is not in the registry,
 * `403` without the module's Permission (checked before the cache is read), otherwise the loader's answer parsed by the
 * module's payload schema.
 */
export async function loadDashboardModule(deps: ModuleDeps, actor: AdminActor, moduleKey: string, rangeParam: unknown): Promise<unknown> {
  const definition = dashboardModule(moduleKey);
  if (!definition) throw new DomainError(404, "Not Found", "not_found");
  if (!isModuleVisible(definition.key, actor.has)) throw new DomainError(403, "Forbidden", "forbidden");
  const key = definition.key as DashboardModuleKey;
  const payload: z.ZodType = MODULE_PAYLOAD_SCHEMAS[key];
  return payload.parse(await MODULE_LOADERS[key](deps, rangeParam));
}

/**
 * Saves one module's range at once (`PUT /api/v1/admin/account/dashboard/ranges/:moduleKey`). `404` for a module key
 * that does not exist, `403` for one the User may not see, `422 invalid_range` for a range the module does not offer.
 * Only the caller's own row changes, and never its arrangement version.
 */
export async function saveModuleRange({ db }: { db: Db }, actor: AdminActor, moduleKey: string, range: unknown): Promise<{ range: ModuleRangeKey }> {
  const definition = dashboardModule(moduleKey);
  if (!definition) throw new DomainError(404, "Not Found", "not_found");
  if (!isModuleVisible(definition.key, actor.has)) throw new DomainError(403, "Forbidden", "forbidden");
  if (!isRange(range) || !(definition.ranges as readonly string[]).includes(range)) throw new DomainError(422, "Unprocessable Entity", "invalid_range");
  await upsertRange(db, actor.userId, definition.key, range);
  return { range };
}

/** Saves the Chart style at once (last write wins). Only a known style is accepted; anything else is 422. */
export async function saveChartStyle({ db }: { db: Db }, actor: AdminActor, chartStyle: unknown): Promise<{ chartStyle: ChartStyle }> {
  if (typeof chartStyle !== "string" || !isStyle(chartStyle)) throw new DomainError(422, "Unprocessable Entity", "invalid_chart_style");
  await upsertChartStyle(db, actor.userId, chartStyle);
  return { chartStyle };
}

/** The version a Save loaded with: an ISO string, or null when the User never saved an arrangement. */
function parseVersion(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString() !== value) throw new DomainError(422, "Unprocessable Entity", "invalid_layout");
  return date;
}

/**
 * Saves the Customize draft (`PUT .../arrangement`). The submitted visible modules are checked strictly (422
 * `invalid_layout`), the modules the User cannot see are re-attached after them in their stored order, and the write
 * succeeds only when `expectedUpdatedAt` is the stored version (409 `stale_layout` otherwise). Unknown keys in the
 * stored layout are dropped by this Save. Ranges and the Chart style are untouched. Returns the Dashboard as it now reads.
 */
export async function saveDashboardArrangement({ db }: { db: Db }, actor: AdminActor, body: { modules?: unknown; expectedUpdatedAt?: unknown }): Promise<DashboardPreferences> {
  const expected = parseVersion(body.expectedUpdatedAt);
  const checked = validateArrangement(body.modules);
  if (!checked.ok) throw new DomainError(422, "Unprocessable Entity", "invalid_layout");
  const row = await findPreferences(db, actor.userId);
  const stored = row?.arrangement ? repairLayout(row.arrangement) : [];
  const modules = mergeHiddenEntries(checked.entries, stored, actor.has);
  if (!(await saveArrangement(db, actor.userId, { version: 1, modules }, expected))) throw new DomainError(409, "Conflict", "stale_layout");
  return getDashboard({ db }, actor);
}

/** Saves a Reset draft that was left unchanged (`DELETE .../arrangement`): the arrangement becomes null, the computed default. */
export async function resetDashboardArrangement({ db }: { db: Db }, actor: AdminActor, expectedUpdatedAt: unknown): Promise<DashboardPreferences> {
  const expected = parseVersion(expectedUpdatedAt);
  if (!(await saveArrangement(db, actor.userId, null, expected))) throw new DomainError(409, "Conflict", "stale_layout");
  return getDashboard({ db }, actor);
}
