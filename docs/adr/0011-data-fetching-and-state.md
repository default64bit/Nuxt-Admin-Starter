# ADR-0011: Data fetching and state

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

The constitution requires Vue Query for API-backed server state. Nuxt SSR needs a deliberate hydration strategy so server-rendered data is reused on the client rather than fetched twice.

## Decision

- Use `@tanstack/vue-query` for API-backed server state: reads use `useQuery`, event-driven writes use `useMutation`. Pages and components do not call `fetch`, `$fetch` or another HTTP client for application data themselves.
- Query keys, query functions, mutations, invalidation and request logic live in feature composables (for example `useDemoTickets()`), keeping pages declarative.
- `$fetch` MAY be the same-origin transport inside a query or mutation function in a feature composable. It MUST NOT be called directly from a page or component as a second data-fetching system.
- Query functions use same-origin `/api/v1/...` URLs. Upstream service URLs and credentials stay server-only.
- SSR-enabled queries use Nuxt-compatible Vue Query hydration and dehydration so server-fetched data is reused. Query keys include every input that changes the result and never contain secrets or needless user-identifying data.
- Mutations invalidate or update all affected query keys explicitly. Do not mirror API data into Pinia.
- Shared client state: `useState` for small SSR-safe values, Pinia only for genuinely app-wide client-owned state such as UI preferences. Never store API cache data in Pinia.
- Forms use the shared Zod schemas (ADR-0008) and show server-side field errors from the API response.
- Values unsafe to serialize (class instances, functions, secrets) never go into Nuxt payloads or hydrated query data.

## Consequences

- Positive: one explicit cache and invalidation model, consistent pending and error states, and shared server and client query behavior.
- Negative: SSR hydration and per-User cache isolation must be implemented carefully. Tests verify no duplicate initial request and no cross-user cache leakage.
