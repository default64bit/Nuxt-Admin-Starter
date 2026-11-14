# Architecture Decision Records (ADRs)

An ADR captures one architecturally significant decision: the context, the choice, and the consequences. They are short, immutable once accepted, and live in the repo next to the code.

## How we use them

- One decision per file, numbered sequentially: `NNNN-short-title.md`.
- Copy `0000-template.md` to start a new one. Open it as a PR so the decision is reviewed, not just the code.
- Status flow: `Proposed` → `Accepted` → (`Deprecated` | `Superseded by ADR-NNNN`).
- Never edit an accepted ADR's decision. Write a new ADR that supersedes it and link both ways.
- The Starter ships these ADRs as current state. A Project keeps them, and changes a decision by superseding it with a new ADR.
- Write an ADR when a choice is expensive to reverse, affects more than one area, or a new teammate would ask "why did we do it this way?".

## Index

| # | Title | Status |
| ---: | --- | --- |
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md) | Accepted |
| 0002 | [Nuxt 4 layout](0002-nuxt-4-layout.md) | Accepted |
| 0003 | [Feature-oriented organization](0003-feature-oriented-organization.md) | Accepted |
| 0004 | [Strict TypeScript](0004-strict-typescript.md) | Accepted |
| 0005 | [Layered server](0005-layered-server.md) | Accepted |
| 0006 | [PostgreSQL + Drizzle](0006-postgresql-drizzle.md) | Accepted |
| 0007 | [Migration workflow](0007-migration-workflow.md) | Accepted |
| 0008 | [Schema validation at boundaries](0008-schema-validation-at-boundaries.md) | Accepted |
| 0009 | [API conventions](0009-api-conventions.md) | Accepted |
| 0010 | [Authentication and authorization](0010-authentication-and-authorization.md) | Accepted |
| 0011 | [Data fetching and state](0011-data-fetching-and-state.md) | Accepted |
| 0012 | [UI: Tailwind v4 + shadcn-vue](0012-ui-tailwind-v4-shadcn-vue.md) | Accepted |
| 0013 | [Rendering and caching](0013-rendering-and-caching.md) | Accepted |
| 0014 | [Configuration and secrets](0014-configuration-and-secrets.md) | Accepted |
| 0015 | [Errors, logging, observability](0015-errors-logging-observability.md) | Accepted |
| 0016 | [Security baseline](0016-security-baseline.md) | Accepted |
| 0017 | [Testing strategy](0017-testing-strategy.md) | Accepted |
| 0018 | [Code quality and git workflow](0018-code-quality-and-git-workflow.md) | Accepted |
| 0019 | [Runtime, package manager, dependencies](0019-runtime-package-manager-dependencies.md) | Accepted |
| 0020 | [CI/CD and deployment](0020-ci-cd-and-deployment.md) | Accepted |
| 0021 | [Notification delivery](0021-notification-delivery.md) | Accepted |
| 0022 | [CSP by hashes for cached pages](0022-csp-by-hashes-for-cached-pages.md) | Accepted |
| 0023 | [CSRF by request-origin checks](0023-csrf-by-request-origin-checks.md) | Accepted |
| 0024 | [Admin analytics live with short cache](0024-admin-analytics-live-with-short-cache.md) | Accepted |
| 0025 | [Admin charts, three Chart styles](0025-admin-charts-three-chart-styles.md) | Accepted |
| 0026 | [Admin reordering](0026-admin-reordering.md) | Accepted |
| 0027 | [Admin list card view](0027-admin-list-card-view.md) | Accepted |
| 0028 | [Admin PWA, Web Push, polled inbox](0028-admin-pwa-web-push-polled-inbox.md) | Accepted |
| 0029 | [Optional pieces](0029-optional-pieces.md) | Accepted |
