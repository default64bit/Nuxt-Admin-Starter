# Admin Dashboard

Living spec for the Dashboard framework and the New accounts module. Decisions: `.specs/decision-log.md` "Dashboard"; ADR 0024 (live analytics, short cache), 0025 (Chart styles), 0026 (reordering). Needs attention, the Demo ticket modules and the trend chart are added by later slices as registry entries.

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
