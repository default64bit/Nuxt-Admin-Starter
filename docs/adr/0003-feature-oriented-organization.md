# ADR-0003: Feature-oriented organization

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Organizing purely by type (all components together, all services together) scales poorly: one feature touches many distant folders. Nuxt's file-based routing and auto-import conventions limit how far fully vertical slices can go.

## Decision

We will group by feature inside each Nuxt directory, using the same feature name everywhere. The demo ticket is the worked example:

```
app/components/demo-ticket/DemoTicketCard.vue
app/composables/demo-ticket/useDemoTickets.ts
app/pages/admin/demo-tickets/index.vue
server/api/v1/demo-tickets/index.get.ts
server/services/demo-ticket.service.ts
server/repositories/demo-ticket.repository.ts
server/database/schema/demo-ticket.ts
shared/schemas/demo-ticket.ts
tests/integration/demo-ticket/...
```

- shadcn-vue primitives stay in `app/components/ui/`. Admin-specific compositions live in `app/components/admin/`. Generic non-domain components may live in `app/components/common/`.
- Cross-feature code goes in `app/utils/` or `server/utils/` only when it is genuinely shared; do not create abstractions solely to meet an arbitrary usage count.
- Do not introduce Nuxt layers unless a concrete need is documented in a new ADR.

## Consequences

- Positive: a feature is easy to find, review, test and delete. The demo domain is removable because every one of its paths carries the `demo-ticket` name, and a Project's own domains follow the same shape.
- Negative: naming discipline is required, and a feature's files are still spread across directories by framework design.
