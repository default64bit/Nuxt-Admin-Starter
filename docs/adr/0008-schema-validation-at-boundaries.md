# ADR-0008: Schema validation at every boundary

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

TypeScript types vanish at runtime. Request bodies, query strings, environment variables and third-party responses are untrusted.

## Decision

- We will use Zod as the single validation library. Schemas live in `shared/schemas/<feature>.ts` so the client form and the server share them.
- Validate on every boundary: request body, query and params (server), forms (client), environment variables at startup (ADR-0014) and external API responses.
- Derive database insert and select schemas from Drizzle tables where possible (Drizzle ships a Zod integration) instead of redeclaring columns, then refine for API-specific rules.
- Infer types with `z.infer`; never duplicate them by hand.
- Validation failures return HTTP 422 (or 400) with the standard error shape (ADR-0015).

## Consequences

- Positive: one source of truth for runtime and compile-time contracts.
- Negative: a slight client bundle cost for shared schemas. Keep schemas small and tree-shakeable.
