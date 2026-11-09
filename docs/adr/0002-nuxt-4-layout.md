# ADR-0002: Nuxt 4 with the `app/`, `server/`, `shared/` layout

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Nuxt 4 uses `app/` as the default source directory for client and universal code, keeps `server/` (Nitro) at the root, and adds `shared/` for code usable by both sides with auto-imports. A clear boundary between client and server code prevents server secrets or database code from leaking into the browser bundle.

## Decision

We will build on current Nuxt 4 with the standard layout:

```
app/      Vue app: pages, components, composables, layouts, middleware, plugins
server/   Nitro: API routes, services, repositories, database, server plugins
shared/   Code used by both: Zod schemas, types, pure utils (no Node or DOM APIs)
```

Rules:

- Nothing in `app/` imports from `server/`. Nothing in `server/` imports from `app/`.
- Both may import from `shared/`. `shared/` imports from neither.
- Use `~/` for `app/`, `~~/` for the repo root, and relative imports inside a folder.

## Alternatives considered

- Nuxt 3 style root-level `pages/` and `components/`: legacy layout, no longer the default.
- Separate backend repository: more infrastructure than an admin panel needs. Revisit if a second client appears.

## Consequences

- Positive: an enforceable boundary (lint rules in ADR-0018) that matches current Nuxt docs and module expectations.
- Negative: `shared/` must stay strictly isomorphic.
