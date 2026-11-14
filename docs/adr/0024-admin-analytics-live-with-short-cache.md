# ADR-0024: Admin analytics are computed live with a short cache

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Dashboard modules and Analytics strips show figures that come from first-party tables the application already stores (Users, audit events, domain rows). At the scale of an internal admin app, each figure is within the cost of live indexed SQL, or SQL with a short cache, and comparisons with the previous period need filters at the level of instants, not days. The app runs as one container, and the Starter adds no new service, time-series database or job queue.

## Decision

1. **Every metric is computed live** from the base tables on request. There are no rollup tables, so there is no backfill or correction job.
2. **Indexes are added when measurement asks for them**, on the columns the queries filter by (ADR-0006).
3. **A bounded in-process cache** is keyed by unit (Dashboard module or strip) + range + bucket. Entries live 60 s when the range includes today and 1 h when it ended before today. Permission is checked **before** the cache is read, and entries are shared between Users because results depend on nothing else. Range presets are shared by all units.
4. **Present-moment figures are never cached:** queue counts, the Needs attention rows and totals.
5. **Each query runs under a 5 s statement timeout** on its own small analytics pool (8 connections), and a unit's independent queries run in parallel, so a unit costs about its slowest query. A timeout fails only that unit. Parallel reads share no snapshot, which is acceptable for figures already up to 60 s old. The Postgres container needs `shm_size: 256mb` in `compose.yaml` for parallel hash joins.
6. **Response budget:** each Dashboard module answers in **at most 300 ms p95 at the Project's planned scale**. It is checked by hand, with `EXPLAIN ANALYZE` on realistic data, before release; it is not a CI step. When a module misses it, fix in this order: add an index first, then an append-only rollup refreshed by the worker, amending this ADR.
7. **The client** refetches on focus with a 60 s `staleTime`; there is no polling for analytics.

## Alternatives considered

- Rollup tables now: backfill and correction jobs plus partial-day complexity, with no measured need.
- A time-series or OLAP database: far more operations than the data needs.
- A shared cache such as Redis: not needed with one container.
- No cache: fine for the data, but repeated Dashboard loads would repeat the heaviest queries.

## Consequences

- Positive: comparisons are exact; closed days never change; nothing derived can drift; nothing new to deploy.
- Negative / trade-offs: figures for a range including today can be up to 60 s old, which the "Updated HH:MM" label makes visible; the cache is per process; heavy units cost real queries on a miss.
- Revisit when the budget is missed, or when the app runs more than one container (the cache must then be shared or dropped).
