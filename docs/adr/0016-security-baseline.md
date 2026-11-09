# ADR-0016: Security baseline

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

An admin panel holds personal data and powerful actions, so every Project starts from strong, boring defaults instead of adding them after the first incident. Other ADRs refine two parts of this baseline: ADR-0022 owns the Content Security Policy and ADR-0023 owns CSRF protection.

## Decision

- We use `nuxt-security` for security headers (CSP, HSTS, `X-Content-Type-Options`, Referrer-Policy), request size limits and rate limiting. The CSP is tuned, never disabled; ADR-0022 describes how it is produced. CSRF is handled by request-origin checks (ADR-0023), not by `nuxt-security`.
- All input is validated at the boundary (ADR-0008), authorization happens on the server (ADR-0010), and queries are parameterized only. Drizzle does this; no string-built SQL.
- Output is escaped by default. No `v-html` with untrusted content; if rich content is ever needed, it is sanitized on the server first.
- Cookies are `HttpOnly`, `Secure` and `SameSite=Lax`. CORS is closed by default; any origin is allowlisted explicitly.
- Uploads (the media pipeline) enforce size and type limits and store objects outside the web root, in object storage.
- Dependencies: grouped automated update PRs, `pnpm audit --audit-level high` and gitleaks in CI, a committed lockfile, and a reviewed install-script allowlist (ADR-0019). Accepted advisory ignores are dated and re-checked.
- Secrets never enter the repository or the client bundle (ADR-0014).
- Before the first public release, a Project walks the OWASP ASVS level 1 checklist.

## Alternatives considered

- Report-only headers: delay real protection.
- Relying on the platform edge for headers: breaks local and non-edge deployments, and hides the policy from the repository.

## Consequences

- Positive: strong defaults against common web attacks, enforced in every environment.
- Negative / trade-offs: a strict CSP needs care with third-party scripts and inline styles. A new third-party origin needs a spec change.
- Follow-ups: ASVS review before launch; re-check advisory ignores when dependencies update.
