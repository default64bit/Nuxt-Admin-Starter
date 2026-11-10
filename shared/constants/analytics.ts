/**
 * Range preset keys shared by the Dashboard module ranges and the analytics API. There is no reports framework in
 * the Starter, so the presets exist only for Dashboard modules (`.specs/admin-dashboard/spec.md` "Ranges").
 */
export const RANGE_PRESET_KEYS = ["today", "yesterday", "last-7-days", "last-30-days", "last-90-days", "this-week", "this-month", "last-month", "this-year"] as const;
export type RangePresetKey = (typeof RANGE_PRESET_KEYS)[number];

/** The six ranges a Dashboard module may offer. */
export const MODULE_RANGE_KEYS = ["today", "yesterday", "last-7-days", "last-30-days", "this-month", "last-month"] as const satisfies readonly RangePresetKey[];
export type ModuleRangeKey = (typeof MODULE_RANGE_KEYS)[number];
