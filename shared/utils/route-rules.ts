/**
 * Rendering and cache rules (ADR-0013). One typed table per page class, expanded into the unprefixed
 * (default locale) and `/en/` rule by `buildRouteRules`, so a rule can never exist without its mirror.
 * A Project adds a page by adding a row to the table of its class. This module must stay
 * dependency-free: `nuxt.config.ts` imports it.
 */

export const ROUTE_LOCALE_PREFIXES = ["", "/en"] as const;

export const PRIVATE_CACHE_CONTROL = "private, no-store";
export const PUBLIC_API_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";
export const NOINDEX = "noindex";

/** Public pages are shared-cached for this many seconds (Nitro `swr`). */
export const PUBLIC_PAGE_SWR_SECONDS = 60;

export interface PageRule {
  name: string;
  /** Unprefixed path; `/path/**` also covers `/path` itself. */
  path: string;
}

/** Server-rendered, shared-cached, identical bytes for every visitor. Never touches the session. */
export const PUBLIC_PAGES: readonly PageRule[] = [{ name: "landing", path: "/" }];

/** Server-rendered per request, never cached, never indexed. Anything that can embed session or User data. */
export const PRIVATE_PAGES: readonly PageRule[] = [
  { name: "sign-in", path: "/sign-in" },
  { name: "admin", path: "/admin/**" },
];

/**
 * `/api/v1` paths whose responses may be shared-cached (exact path, no query). Empty in the Starter;
 * it grows only by deliberate additions, each of which must carry no session or User data.
 */
export const PUBLIC_API_ALLOWLIST: readonly string[] = [];

/** Always private, even if a handler forgets to say so. */
export const PRIVATE_API_PATTERNS: readonly string[] = ["/api/_auth/**", "/api/v1/auth/**"];

export interface RouteRule {
  ssr?: boolean;
  swr?: number;
  cache?: false;
  headers?: Record<string, string>;
}

/** Every concrete path a page rule covers, for one locale prefix. */
export function pathsForPrefix(path: string, prefix: string): string[] {
  const full = path === "/" ? prefix || "/" : `${prefix}${path}`;
  if (full.endsWith("/**")) return [full.slice(0, -3), full];
  return [full];
}

const PUBLIC_PAGE_RULE: RouteRule = { ssr: true, swr: PUBLIC_PAGE_SWR_SECONDS };

const PRIVATE_PAGE_RULE: RouteRule = {
  ssr: true,
  cache: false,
  headers: { "cache-control": PRIVATE_CACHE_CONTROL, "x-robots-tag": NOINDEX },
};

const PRIVATE_API_RULE: RouteRule = { cache: false, headers: { "cache-control": PRIVATE_CACHE_CONTROL } };

export function buildRouteRules(): Record<string, RouteRule> {
  const rules: Record<string, RouteRule> = {};
  for (const prefix of ROUTE_LOCALE_PREFIXES) {
    for (const page of PUBLIC_PAGES) {
      for (const path of pathsForPrefix(page.path, prefix)) rules[path] = { ...PUBLIC_PAGE_RULE };
    }
    for (const page of PRIVATE_PAGES) {
      for (const path of pathsForPrefix(page.path, prefix)) {
        rules[path] = { ...PRIVATE_PAGE_RULE, headers: { ...PRIVATE_PAGE_RULE.headers } };
      }
    }
  }
  rules["/api/v1/**"] = { ...PRIVATE_API_RULE, headers: { ...PRIVATE_API_RULE.headers } };
  for (const pattern of PRIVATE_API_PATTERNS) {
    rules[pattern] = { ...PRIVATE_API_RULE, headers: { ...PRIVATE_API_RULE.headers } };
  }
  for (const path of PUBLIC_API_ALLOWLIST) {
    rules[path] = { headers: { "cache-control": PUBLIC_API_CACHE_CONTROL } };
  }
  return rules;
}

/** Cache-Control a `/api/v1` response must carry, or null when the path is not under `/api/v1`. */
export function apiCacheControlFor(path: string): string | null {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  if (pathname !== "/api/v1" && !pathname.startsWith("/api/v1/")) return null;
  return PUBLIC_API_ALLOWLIST.includes(pathname) ? PUBLIC_API_CACHE_CONTROL : PRIVATE_CACHE_CONTROL;
}

// The router matches paths case-insensitively and ignores a trailing slash, while route rules do not,
// so request paths are normalised here before they are compared with the page tables.
function normalise(path: string): string {
  return (path.split(/[?#]/, 1)[0] ?? "").toLowerCase().replace(/(.)\/+$/, "$1");
}

function matchesPage(pathname: string, page: PageRule, prefix: string): boolean {
  return pathsForPrefix(page.path, prefix).some((candidate) => {
    if (candidate.endsWith("/**")) {
      const base = candidate.slice(0, -3);
      return pathname === base || pathname.startsWith(`${base}/`);
    }
    return pathname === candidate;
  });
}

function matchesAny(path: string, pages: readonly PageRule[]): boolean {
  const pathname = normalise(path);
  return ROUTE_LOCALE_PREFIXES.some((prefix) => pages.some((page) => matchesPage(pathname, page, prefix)));
}

/** Whether a request path is a shared-cached public page in either locale. */
export function isSharedCachedPagePath(path: string): boolean {
  return matchesAny(path, PUBLIC_PAGES);
}

/** Whether a request path is a private (uncached, per-visitor, noindex) page in either locale, in any letter case. */
export function isPrivatePagePath(path: string): boolean {
  return matchesAny(path, PRIVATE_PAGES);
}
