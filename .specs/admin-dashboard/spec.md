# Admin Dashboard

Living spec for the Dashboard framework and its shipped modules: Needs attention, New accounts and the two Demo ticket modules. Decisions: `.specs/decision-log.md` "Dashboard"; ADR 0024 (live analytics, short cache), 0025 (Chart styles), 0026 (reordering). A Project adds a module as a registry entry (`docs/guides/add-domain.md`, step 8).

## Modules

### Requirement: One registry registers a module

An entry in `shared/constants/dashboard-modules.ts` carries the key, the one gate Permission, the allowed widths and default width, the offered ranges and default range, whether it is in the default layout, and a preview kind (attention, bars, pipeline, sparkline, figures, rates, ranking). The module limit is the registry length. The payload schema, loader and component are lookups typed by the module key; the colour variable and the `fa`/`en` title are checked by a completeness test.

#### Scenario: A piece is missing
- GIVEN a registry entry without a loader, component, payload schema, title or colour variable
- WHEN the type check or `tests/unit/shared/dashboard-modules.test.ts` runs
- THEN it fails

### Requirement: New accounts

The module (Permission `view-users`, hue 100) shows accounts created in the range with the change from the previous period, a daily sparkline of at least 7 days, and the total of accounts now. Its footer links to Users.

#### Scenario: A User without `view-users`
- GIVEN a User who lacks `view-users`
- WHEN they request the module, or save a range for it
- THEN the server answers 403, and the picker never offers it

### Requirement: Needs attention

The module (no gate Permission, `fixed`) is always first, cannot be removed or moved, and has one row per queue the User may open: a nav item with a `countKey` whose page the User may open. A row's count is the menu badge's own count (`getQueueCounts`), is never cached, and links to the queue's page; a row with nothing waiting is muted and has no link. The module hides itself when no row is visible, and shows "All caught up" when every visible row is zero. A Project adds a row with the nav-count queue recipe in `docs/guides/add-domain.md` (nav item `countKey`, `NAV_QUEUE_COUNT_KEYS`, the nav-counts schema, a `getQueueCounts` line and the `admin.dashboard.needsAttention.rows.<countKey>` message).

#### Scenario: A User without the queue's Permission
- GIVEN a User who lacks `view-demo-tickets`
- WHEN they request Needs attention
- THEN the Open demo tickets row is absent, and the module is hidden when no other row remains

#### Scenario: A queue changes
- GIVEN a poll that sees a queue count change
- WHEN the nav counts answer
- THEN the queue's list and the Needs attention module refetch in the background

### Requirement: Demo ticket modules

Part of the Reference module (`demo-ticket` markers), both gated by `view-demo-tickets`. **Demo tickets by status** (hue 215, widths third or half, no range) shows how many tickets are in each status now: the whole pipeline in order, zero for an empty status, read live and never cached. **Demo tickets created per day** (hue 190, widths half or full, ranges last 7 days, last 30 days, this month and last month, default last 30 days) shows one bucket per Tehran day of the range with zero days included, the total, and a trend chart in the User's Chart style. Neither exists after `just demo-remove`.

#### Scenario: A User without `view-demo-tickets`
- GIVEN a User who lacks `view-demo-tickets`
- WHEN they request either module
- THEN the server answers 403, and the picker never offers it

### Requirement: Default layout

A User with no saved arrangement sees Needs attention first, then the modules marked in the default layout in registry order: Demo tickets by status, Demo tickets created per day, New accounts. Only modules whose Permission the User holds appear.

## Layout storage

### Requirement: Layout is saved per User

One `dashboard_preferences` row per User holds the arrangement (`null` is the computed default), ranges, Chart style and the arrangement version. A missing row means every default applies. Changes are personal preferences and are not audited.

#### Scenario: Unknown keys
- GIVEN a stored layout naming a module no longer in the registry
- WHEN the User reads the Dashboard
- THEN the unknown key is dropped in memory, and the stored layout changes only on the next Save

#### Scenario: Save from two devices
- GIVEN two devices loaded the same version
- WHEN both Save
- THEN the second gets 409 `stale_layout` and may Load latest

#### Scenario: Reset to default
- WHEN a User resets and saves the unchanged draft
- THEN the arrangement becomes `null`, and ranges and Chart style are kept

### Requirement: Strict save

A Save is rejected with 422 `invalid_layout` for an unknown key, a duplicate, a width the module does not allow, an extra field, or more entries than the registry holds. Modules the User cannot see stay stored after the visible ones.

## Customize

A User adds modules from Choose modules (a sample preview per module, in their Chart style), removes, resizes among the allowed widths, sets Fill, and reorders by drag or by the Move menu. Nothing is saved until Save; Cancel discards. Leaving with an unsaved draft asks first. A range change and a Chart style change save at once.

## Ranges and caching

Range presets: today, yesterday, last 7 days, last 30 days, this month, last month (Tehran days, Saturday weeks, Jalali months). A module is cached in process by module + range + window for 60 s when the range includes today and 1 h otherwise; permission is checked before the cache is read. Each query runs under a 5 s statement timeout (503 `analytics_timeout`).
