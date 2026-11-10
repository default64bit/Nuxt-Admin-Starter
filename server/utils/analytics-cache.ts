// The in-process analytics cache (ADR-0024): keyed by unit + range + bucket, shared by admins, expiring only by TTL (writes never invalidate it).
// Callers check permission before they read it.

export const TODAY_TTL_MS = 60_000;
export const CLOSED_TTL_MS = 60 * 60_000;

/** A range that includes today is cached for 60 s; a range that ended before today for an hour. */
export const analyticsTtl = (includesToday: boolean) => (includesToday ? TODAY_TTL_MS : CLOSED_TTL_MS);

interface Entry {
  value: unknown;
  expiresAt: number;
}

export interface AnalyticsCache {
  /** The cached value for `key`, or `compute()` stored for `ttlMs`. A failed computation is never stored. */
  remember<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T>;
  clear(): void;
}

export function createAnalyticsCache(now: () => number = Date.now, maxEntries = 500): AnalyticsCache {
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<unknown>>();
  return {
    async remember<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now()) return hit.value as T;
      const running = pending.get(key);
      if (running) return running as Promise<T>;
      const promise = compute()
        .then((value) => {
          if (entries.size >= maxEntries) for (const [k, e] of entries) if (e.expiresAt <= now()) entries.delete(k);
          if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
          entries.set(key, { value, expiresAt: now() + ttlMs });
          return value;
        })
        .finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    },
    clear() {
      entries.clear();
      pending.clear();
    },
  };
}

/** The server-wide cache. */
export const analyticsCache = createAnalyticsCache();
