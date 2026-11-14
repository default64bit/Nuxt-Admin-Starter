# ADR-0005: Layered server

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

When route handlers contain SQL, validation, business rules and response shaping, they become untestable and duplicated. The backend needs a structure that stays clear as it grows, without enterprise-style overengineering.

## Decision

Server code is split into four layers with one-way dependencies:

```
server/api/*            HTTP only: parse and validate input, call a service, return the result
server/services/*       Business logic and authorization rules, no HTTP types
server/repositories/*   All database access (Drizzle queries), no business rules
server/database/*       Drizzle client, schema, migrations
```

Rules:

- `api` → `services` → `repositories` → `database`. Never skip or reverse a layer.
- Route handlers are thin (about 10 to 20 lines) and wrapped in `defineEventHandler`. They use `getValidatedQuery` and `readValidatedBody` with Zod schemas.
- Services receive plain arguments (and the authenticated User), not `H3Event`.
- Transactions are opened in services and passed to repositories.
- `server/` imports services and repositories explicitly rather than through auto-import, so dependencies stay visible.

## Consequences

- Positive: services are unit-testable without HTTP, and database changes stay in one place.
- Negative: more files for trivial CRUD. A simple read-only endpoint may call a repository through a one-line service, kept for consistency.
