# ADR-0023: CSRF by request-origin checks

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

`nuxt-csurf` is off by default, skips `DELETE`, is unsupported on prerendered or cached pages (the token lives in per-request DOM) and would replay one cookie and token from a cached entry. The landing page is shared-cached (ADR-0013) and the API is same-origin. This ADR replaces the CSRF mechanism named in ADR-0016.

## Decision

- `nuxt-security`'s CSRF stays off. One Nitro middleware protects every `POST`, `PUT`, `PATCH` and `DELETE` under `/api/v1/**`: allow `Sec-Fetch-Site` of `same-origin` or `none`; if it is absent, require `Origin` to match the configured site origin; if both are absent, respond `403 csrf_rejected`.
- Any request with a body, and sign-out (which sends `{}`), must send `Content-Type: application/json`.
- The session cookie is `HttpOnly` and `SameSite=Lax`. Sign-out is `POST`, never `DELETE`.
- Provider callbacks that must accept cross-site `POST`s go on an explicit allowlist. The Starter ships it empty; a Project that adds a provider callback adds its path with a spec change.

## Alternatives considered

- Per-request token endpoint: adds a round trip and a cache-sensitive secret.
- Make every page uncached SSR: contradicts ADR-0013.

## Consequences

- Positive: works from cached HTML; uniform across the API; no secret to leak.
- Negative / trade-offs: relies on browsers sending Fetch-Metadata or `Origin`; tests must set `Origin`.
