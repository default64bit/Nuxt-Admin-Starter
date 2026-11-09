# ADR-0013: Rendering and caching

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Pages differ in freshness and personalization needs. The public landing page is the same for every visitor and should be cheap to serve. Everything else is behind sign-in, depends on the session, and must never be stored by a shared cache. A cached page cannot know the session, carry a CSRF token or a per-request nonce, and a client-only (`ssr: false`) admin cannot return a real 404. Deployment is one Nitro `node-server` with no CDN in front by default, so "shared cache" means Nitro's `swr` cache.

## Decision

- **Landing page:** server-rendered with `swr` (60 seconds), identical bytes for every visitor and never containing a session. It uses `useSeoMeta`, a canonical URL and reciprocal `hreflang`; the site URL is deployment-configured. `swr` is used rather than `isr` because the host is `node-server`.
- **Private pages** (`/sign-in` and `/admin/**`, each also under `/en/`): SSR with `cache: false`, the session in the payload, `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`. `ssr: false` is not part of the rendering policy. Async shell data uses `<Suspense>` with skeletons.
- **Robots:** no SEO module. Admin is `noindex` through route rules, and a static `robots.txt` disallows `/admin`.
- **Locales:** Nuxt I18n uses `prefix_except_default`. `fa` is the default locale at unprefixed routes and `en` lives under `/en/`; the default is changeable in one documented config line.
- **Cache-header invariants**, enforced by `routeRules` and a test:
  1. Anything embedding or returning session or User data is `private, no-store`.
  2. Shared-cacheable responses never carry `Set-Cookie` or User data, and `cookie` is never added to Nitro `varies`.
  3. `/api/v1` defaults to `private, no-store` unless a path is on an explicit public-cache allowlist, which is empty in the Starter and grows only by deliberate additions (`s-maxage=60, stale-while-revalidate=300`).
  4. No per-request secret (nonce, token) appears in a shared-cacheable body.
- **Route rules:** every entry exists for both the unprefixed and the `/en/` path. One typed helper generates the pair, and a test iterates the configured locales and fails when a rule lacks its mirror. `/api/_auth/**` and `/api/v1/auth/**` are `private, no-store`.
- **Performance:** Core Web Vitals targets at p75 are LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1. They are acceptance criteria on specs where relevant; the Starter's CI gate is limited to the chart chunk size check (ADR-0025). Below-the-fold components are lazy-loaded and images use `<NuxtImg>` with sizes.

## Alternatives considered

- Uncached SSR everywhere: rebuilds the landing page per request for no benefit.
- Prerendering the landing page: ties runtime configuration to the build and cannot vary per deployment without a rebuild.
- A client-only admin: cannot return a real 404 and leaks the shell to guests.

## Consequences

- Positive: a cacheable public page, no session leak path, and a real 404 for the admin panel.
- Negative: rules must be mirrored per locale and are guarded by tests, and a wrong rule can serve stale or leaked data, so the invariants test is mandatory.
- Follow-ups: CSP for cached pages is ADR-0022, request-origin CSRF is ADR-0023.
