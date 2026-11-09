# ADR-0004: Strict TypeScript

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Type errors caught in the editor are far cheaper than in production. Nuxt can infer API response types from route handlers, and Drizzle infers types from the schema.

## Decision

- TypeScript `strict` is on (the Nuxt default), and `noUncheckedIndexedAccess` is enabled on top.
- No `any` without a justifying comment. Prefer `@ts-expect-error` over `@ts-ignore`.
- Types flow from a single source: the Drizzle schema, then the Zod schemas in `shared/schemas/`, then API handler response types, then the Vue Query query and mutation functions (which use the typed same-origin transport). We do not hand-write duplicate interfaces for these.
- `pnpm typecheck` (Nuxt's typecheck) runs in CI and fails the build.
- Use `import type` for type-only imports.

## Consequences

- Positive: refactors are safe, and API contract drift becomes a compile error.
- Negative: stricter code takes slightly longer to write, and some third-party types need small local shims.
