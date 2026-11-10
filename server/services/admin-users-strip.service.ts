import type { Db } from "../database/types";
import { usersStripSchema, type UsersStrip } from "../../shared/schemas/admin-users-strip";
import { dayIso, dayNumber, resolveRange } from "../../shared/utils/business-calendar";
import { accountsCreatedByDay, countAccounts, countAccountsCreated, countDisabledAccounts } from "../repositories/account-analytics.repository";
import { analyticsCache, analyticsTtl, type AnalyticsCache } from "../utils/analytics-cache";
import { withAnalyticsTimeout } from "./admin-dashboard.service";

interface StripDeps {
  db: Db;
  cache?: AnalyticsCache;
  now?: () => Date;
}

/**
 * The Users strip (`GET /api/v1/admin/analytics/strips/users`): new accounts over the last 30 days (Tehran days, ending
 * today) against the 30 days before, with a daily sparkline. That period is cached like a Dashboard module (ADR-0024);
 * the total and the disabled count are read live. The route checked the `view-users` Permission.
 */
export async function loadUsersStrip({ db, cache = analyticsCache, now = () => new Date() }: StripDeps): Promise<UsersStrip> {
  const resolved = resolveRange("last-30-days", now());
  const cacheKey = ["strip-users", resolved.window.from.toISOString(), "auto"].join("|");
  const [period, counts] = await Promise.all([
    cache.remember(cacheKey, analyticsTtl(resolved.includesToday), async () => {
      const [current, previous, byDay] = await withAnalyticsTimeout(db, (tx) =>
        Promise.all([countAccountsCreated(tx, resolved.window), countAccountsCreated(tx, resolved.previous), accountsCreatedByDay(tx, resolved.window)]),
      );
      const perDay = new Map(byDay.map((entry) => [entry.day, entry.count]));
      const first = dayNumber(resolved.firstDay);
      const last = dayNumber(resolved.lastDay);
      const sparkline = Array.from({ length: last - first + 1 }, (_, i) => ({ day: dayIso(first + i), count: perDay.get(dayIso(first + i)) ?? 0 }));
      return { newAccounts: { current, previous }, sparkline };
    }),
    withAnalyticsTimeout(db, (tx) => Promise.all([countAccounts(tx), countDisabledAccounts(tx)])),
  ]);
  return usersStripSchema.parse({ ...period, total: counts[0], disabled: counts[1] });
}
