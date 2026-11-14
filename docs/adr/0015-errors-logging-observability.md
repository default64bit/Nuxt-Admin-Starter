# ADR-0015: Errors, logging, observability

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Production needs exception visibility without sending business data to a third-party service. A self-hosted, Sentry-compatible stack fits the single-VPS Docker Compose deployment, and it is an Optional piece (ADR-0029) that can be Off or Removed.

## Decision

### Errors

- Server errors use `createError({ statusCode, statusMessage, data })`. Services throw typed domain errors (`NotFoundError`, `ConflictError`, ...) that a single Nitro error handler maps to HTTP.
- Production error bodies are `{ statusCode, statusMessage, data: { code, fieldErrors? } }`. No stack traces or SQL in responses.
- Client: `app/error.vue` for fatal errors, `<NuxtErrorBoundary>` around risky widgets, and user-friendly toasts for mutation failures.

### Logging and health

- Application logs are structured JSON on stdout with a request or correlation ID on every line, written at boundaries and on failures rather than on every successful internal step. Docker log rotation applies. No Prometheus, Grafana or centralized log product is required.
- Logs and exception events MUST redact OTPs, session cookies and tokens, phone numbers where not needed, provider and Channel secrets, push subscription keys and unnecessary request or User data. Do not log full request bodies for authentication operations.
- `/api/health/live` checks process liveness. A separate readiness endpoint checks what the app needs to serve traffic: PostgreSQL, plus private storage when media is configured. An error-tracking outage MUST NOT make the app unready.
- Notification worker failures and dead-lettered deliveries are visible in an operational health surface and logs; transport failures never roll back domain state.
- Metrics and distributed tracing (OpenTelemetry) are deferred until real traffic or a concrete need justifies them.

### Exception monitoring

- **GlitchTip**, self-hosted and Sentry-compatible, runs under Docker Compose behind the `monitoring` profile with a pinned, reviewed image. It uses its own logical PostgreSQL database and credentials. Registration is disabled after the first authorized monitoring admin is provisioned, and the UI is reachable only over HTTPS at the configured errors domain.
- The app uses `@sentry/nuxt` for client and server **error capture only**; tracing and session replay are off. Capture is gated by the DSN: an empty DSN means not configured and nothing is sent. Missing DSNs are normal in local and test, core behavior and CI never depend on GlitchTip, and reporting failures never fail a request.
- Disable the SDK's default PII collection and scrub events and breadcrumbs before submission.
- When GlitchTip is Off, the app exposes no CSP report endpoint, release guards drop the errors domain, and the edge serves no errors host.

## Consequences

- Positive: owner-controlled exception data, practical production debugging, and one Compose-managed observability UI.
- Negative: GlitchTip consumes VPS resources and needs upgrades, database management, access control and a retention policy.

## Validation requirements

Before relying on GlitchTip in production: verify ingestion with a test event, confirm registration is disabled, create the initial admin, verify client and server DSNs, prove redaction with synthetic phone and OTP values, and verify the app and CI succeed when DSNs or GlitchTip are unavailable.
