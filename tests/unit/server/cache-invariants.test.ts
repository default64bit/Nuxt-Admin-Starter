// @vitest-environment node
import { readdirSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createApp, createError, eventHandler, send, setResponseHeader, setResponseStatus, toNodeListener, toWebHandler } from "h3";
import { afterAll, describe, expect, it } from "vitest";
import errorChain from "../../../server/error-handler";
import { applyHttpPolicy } from "../../../server/utils/http-policy";
import { attachRequestId } from "../../../server/utils/request-id";
import {
  PRIVATE_API_PATTERNS,
  PRIVATE_CACHE_CONTROL,
  PRIVATE_PAGES,
  PUBLIC_API_ALLOWLIST,
  PUBLIC_API_CACHE_CONTROL,
  PUBLIC_PAGES,
  ROUTE_LOCALE_PREFIXES,
  apiCacheControlFor,
  buildRouteRules,
  isPrivatePagePath,
  isSharedCachedPagePath,
  pathsForPrefix,
} from "../../../shared/utils/route-rules";

// The cache-header invariants of ADR-0013. Everything iterates the page tables, so a page added to a
// table is covered without touching this file.

const rules = buildRouteRules();
const concretePaths = (pages: typeof PUBLIC_PAGES) =>
  pages.flatMap((page) => ROUTE_LOCALE_PREFIXES.flatMap((prefix) => pathsForPrefix(page.path, prefix))).map((path) => path.replace(/\/\*\*$/, "/x"));

describe("route rules", () => {
  it("mirrors every unprefixed page rule under /en with an identical rule", () => {
    const unprefixed = Object.keys(rules).filter((path) => !path.startsWith("/api") && !path.startsWith("/en"));
    expect(unprefixed.length).toBeGreaterThan(0);
    for (const path of unprefixed) {
      const mirror = path === "/" ? "/en" : `/en${path}`;
      expect(rules[mirror], `${path} lacks ${mirror}`).toEqual(rules[path]);
    }
  });

  it("server-renders and shared-caches public pages with nothing per visitor", () => {
    for (const page of PUBLIC_PAGES) {
      for (const prefix of ROUTE_LOCALE_PREFIXES) {
        for (const path of pathsForPrefix(page.path, prefix)) {
          const rule = rules[path]!;
          expect(rule.ssr, path).toBe(true);
          expect(rule.swr, path).toBeGreaterThan(0);
          expect(rule.headers, path).toBeUndefined();
          expect(JSON.stringify(rule).toLowerCase()).not.toContain("cookie");
        }
      }
    }
  });

  it("serves private pages (sign-in, admin) uncached, private and noindex", () => {
    expect(PRIVATE_PAGES.map((page) => page.name)).toEqual(expect.arrayContaining(["sign-in", "admin"]));
    for (const page of PRIVATE_PAGES) {
      for (const prefix of ROUTE_LOCALE_PREFIXES) {
        for (const path of pathsForPrefix(page.path, prefix)) {
          const rule = rules[path]!;
          expect(rule.ssr, path).toBe(true);
          expect(rule.cache, path).toBe(false);
          expect(rule.swr, path).toBeUndefined();
          expect(rule.headers, path).toEqual({ "cache-control": PRIVATE_CACHE_CONTROL, "x-robots-tag": "noindex" });
        }
      }
    }
  });

  it("makes /api/v1 and the auth routes private, with an empty public allowlist", () => {
    expect(rules["/api/v1/**"]?.headers?.["cache-control"]).toBe(PRIVATE_CACHE_CONTROL);
    for (const pattern of PRIVATE_API_PATTERNS) expect(rules[pattern]?.headers?.["cache-control"], pattern).toBe(PRIVATE_CACHE_CONTROL);
    expect(PUBLIC_API_ALLOWLIST).toEqual([]);
    expect(PUBLIC_API_CACHE_CONTROL).toBe("public, s-maxage=60, stale-while-revalidate=300");
    expect(apiCacheControlFor("/api/v1/anything")).toBe(PRIVATE_CACHE_CONTROL);
    expect(apiCacheControlFor("/api/health/live")).toBeNull();
  });

  it("classifies the page paths in any letter case, with a trailing slash, and keeps the classes apart", () => {
    for (const path of concretePaths(PRIVATE_PAGES)) {
      for (const variant of [path, `${path}/`, path.toUpperCase()]) {
        expect(isPrivatePagePath(variant), variant).toBe(true);
        expect(isSharedCachedPagePath(variant), variant).toBe(false);
      }
    }
    for (const path of concretePaths(PUBLIC_PAGES)) {
      expect(isSharedCachedPagePath(path), path).toBe(true);
      expect(isPrivatePagePath(path), path).toBe(false);
    }
    expect(isPrivatePagePath("/administrator")).toBe(false);
    expect(isSharedCachedPagePath("/api/v1/x")).toBe(false);
  });

  it("has every page under app/pages classified as public or private", () => {
    const pagesDir = fileURLToPath(new URL("../../../app/pages", import.meta.url));
    const routes = (readdirSync(pagesDir, { recursive: true, encoding: "utf8" }) as string[])
      .filter((file) => file.endsWith(".vue"))
      .map((file) => `/${file.replace(/\.vue$/, "").replace(/(^|\/)index$/, "").replace(/\[\.{0,3}[^\]]+\]/g, "x")}`.replace(/\/+$/, "") || "/");
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(isSharedCachedPagePath(route) || isPrivatePagePath(route), `${route} is in neither PUBLIC_PAGES nor PRIVATE_PAGES`).toBe(true);
    }
  });
});

describe("http policy", () => {
  const appWith = (handler: Parameters<typeof eventHandler>[0]) => {
    const app = createApp({
      onBeforeResponse: (event) => applyHttpPolicy(event, { apiCacheControlFor, isPrivatePagePath, isSharedCachedPagePath }),
    });
    app.use(
      eventHandler((event) => {
        attachRequestId(event);
        return handler(event);
      }),
    );
    return toWebHandler(app);
  };

  it("forces private, no-store and noindex on every private page whatever the renderer set", async () => {
    for (const path of concretePaths(PRIVATE_PAGES).flatMap((p) => [p, p.toUpperCase()])) {
      const res = await appWith((event) => {
        setResponseStatus(event, 404);
        setResponseHeader(event, "cache-control", "no-cache");
        return "";
      })(new Request(`http://x${path}`));
      expect(res.headers.get("cache-control"), path).toBe(PRIVATE_CACHE_CONTROL);
      expect(res.headers.get("x-robots-tag"), path).toBe("noindex");
    }
  });

  it("forces private, no-store on /api/v1, even when a handler asks for public", async () => {
    const res = await appWith((event) => {
      setResponseHeader(event, "cache-control", "public, max-age=3600");
      return {};
    })(new Request("http://x/api/v1/anything"));
    expect(res.headers.get("cache-control")).toBe(PRIVATE_CACHE_CONTROL);
  });

  it("strips Set-Cookie and Vary: cookie from shared-cached pages and leaves assets alone", async () => {
    const page = await appWith((event) => {
      setResponseHeader(event, "set-cookie", "visitor=1; Path=/");
      setResponseHeader(event, "vary", "Cookie, Accept-Encoding");
      return "<html></html>";
    })(new Request("http://x/en"));
    expect(page.headers.get("set-cookie")).toBeNull();
    expect(page.headers.get("vary")).toBe("Accept-Encoding");

    const asset = await appWith((event) => {
      setResponseHeader(event, "cache-control", "public, max-age=31536000, immutable");
      return "";
    })(new Request("http://x/_nuxt/entry.js"));
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });
});

// Nitro's error chain: this project's handler is first; the framework's HTML renderer comes after and
// (for every 404) writes `cache-control: no-cache` last. Simulated here by a second link in the chain,
// on a real Node HTTP server so the response head goes through `writeHead` as in production.
describe("error pages of private routes", () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterAll(() => Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))));

  async function get(status: number, path: string) {
    const app = createApp({
      onError: async (error, event) => {
        await errorChain(error, event);
        if (event.handled) return;
        setResponseStatus(event, status);
        setResponseHeader(event, "cache-control", "no-cache");
        await send(event, "<html><h1>Not found</h1></html>", "text/html");
      },
    });
    app.use(
      eventHandler(() => {
        throw createError({ statusCode: status });
      }),
    );
    const server = createServer(toNodeListener(app));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
  }

  it("keep private, no-store on a 404 and a 500, and other pages are left to the framework", async () => {
    for (const path of concretePaths(PRIVATE_PAGES).flatMap((p) => [p, p.toUpperCase()])) {
      expect((await get(404, path)).headers.get("cache-control"), path).toBe(PRIVATE_CACHE_CONTROL);
    }
    expect((await get(500, "/en/admin")).headers.get("cache-control")).toBe(PRIVATE_CACHE_CONTROL);
    expect((await get(404, "/en/this-page-does-not-exist")).headers.get("cache-control")).toBe("no-cache");
  });
});
