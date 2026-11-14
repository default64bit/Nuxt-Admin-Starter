# ADR-0009: API conventions

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

The only client of the API is the app itself, served from the same origin. Predictable endpoints keep client code simple and keep internal data from leaking by accident.

## Decision

- REST-style JSON endpoints under `server/api/v1/`, resource-oriented plural nouns: `server/api/v1/demo-tickets/index.get.ts`, `[id].patch.ts`, `index.post.ts`, `[id].delete.ts`. This implements the constitution's same-origin `/api/v1/...` contract.
- Use method suffixes in file names; never one handler switching on method.
- Status codes: 200 read or update, 201 create, 204 delete, 400 or 422 validation, 401 unauthenticated, 403 unauthorized, 404 missing, 409 conflict.
- Lists are paginated by default: cursor-based for large or changing sets, offset only for small admin tables. Cursor lists answer `{ items, nextCursor }`.
- JSON fields are `camelCase`; timestamps are ISO 8601 UTC strings; ids are opaque strings to the client.
- Never return raw database rows by accident: the service layer maps to explicit response types, so internal columns cannot leak.
- Breaking changes: prefer additive changes. If unavoidable, introduce a new API major version (for example `/api/v2/...`) and migrate callers deliberately; do not mix incompatible contracts under one version prefix. Because the only client is this app, a version migration can ship atomically with the client.
- An API that becomes public or third-party-facing gets an OpenAPI description (Nitro can generate one) before release.

## Consequences

- Positive: predictable endpoints, simple client code, no data leaks by default.
- Negative: explicit mapping adds boilerplate.
