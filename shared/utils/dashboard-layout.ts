import { DASHBOARD_MODULES, DASHBOARD_MODULE_LIMIT, DASHBOARD_WIDTHS, dashboardModule, type DashboardWidth } from "../constants/dashboard-modules";
import type { PermissionKey } from "../constants/permissions";
import { moveItem, type MoveDirection } from "./sortable";

/** One module of a layout: where it sits is its place in the list. */
export interface DashboardLayoutEntry {
  key: string;
  width: DashboardWidth;
  fill: boolean;
}

export type HasPermission = (key: PermissionKey) => boolean;

/** A module is visible to a User who holds its one Permission. */
export function isModuleVisible(key: string, has: HasPermission): boolean {
  const definition = dashboardModule(key);
  return definition !== undefined && has(definition.permission);
}

/** The computed default layout (registry order, default widths, Fill off). Hidden modules are not skipped here; use `visibleEntries`. */
export function defaultLayout(): DashboardLayoutEntry[] {
  return DASHBOARD_MODULES.filter((module) => module.inDefaultLayout).map((module) => ({ key: module.key, width: module.defaultWidth, fill: false }));
}

/** Keeps the modules the User may see, in order: a User with few Permissions gets the same list with the rest skipped. */
export const visibleEntries = (entries: readonly DashboardLayoutEntry[], has: HasPermission): DashboardLayoutEntry[] => entries.filter((entry) => isModuleVisible(entry.key, has));

const isWidth = (value: unknown): value is DashboardWidth => typeof value === "string" && (DASHBOARD_WIDTHS as readonly string[]).includes(value);

/**
 * Repairs a stored arrangement document in memory, leniently and never failing: unknown keys are dropped, the first of
 * any duplicates is kept, a width the module no longer offers becomes the module's default and the list is capped.
 * Anything that is not a version-1 document repairs to the default layout. The repair is written only on the User's
 * next Save, so removing a module from the registry needs no migration.
 */
export function repairLayout(stored: unknown): DashboardLayoutEntry[] {
  const modules = typeof stored === "object" && stored !== null && (stored as { version?: unknown }).version === 1 ? (stored as { modules?: unknown }).modules : null;
  if (!Array.isArray(modules)) return defaultLayout();
  const seen = new Set<string>();
  const repaired: DashboardLayoutEntry[] = [];
  for (const raw of modules) {
    const entry = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const definition = typeof entry.key === "string" ? dashboardModule(entry.key) : undefined;
    if (!definition || seen.has(definition.key)) continue;
    seen.add(definition.key);
    repaired.push({ key: definition.key, width: isWidth(entry.width) && definition.widths.includes(entry.width) ? entry.width : definition.defaultWidth, fill: entry.fill === true });
  }
  return repaired.slice(0, DASHBOARD_MODULE_LIMIT);
}

// --- Customize: strict save, hidden modules, Fill packing and the draft operations -------------------------------

/** `422 invalid_layout` for a submitted arrangement, or the entries when every rule holds. */
export type LayoutCheck = { ok: true; entries: DashboardLayoutEntry[] } | { ok: false; reason: string };

/**
 * The strict save-time check. Rejects an unknown key, a duplicate, a width the module does not allow, an entry with
 * any other field (a range on an entry: the draft never carries ranges) and more entries than the registry holds.
 * A module whose Permission was just removed is not rejected.
 */
export function validateArrangement(raw: unknown): LayoutCheck {
  if (!Array.isArray(raw)) return { ok: false, reason: "not_a_list" };
  if (raw.length > DASHBOARD_MODULE_LIMIT) return { ok: false, reason: "too_many" };
  const seen = new Set<string>();
  const entries: DashboardLayoutEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return { ok: false, reason: "bad_entry" };
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).some((name) => name !== "key" && name !== "width" && name !== "fill")) return { ok: false, reason: "unknown_field" };
    const definition = typeof entry.key === "string" ? dashboardModule(entry.key) : undefined;
    if (!definition) return { ok: false, reason: "unknown_key" };
    if (seen.has(definition.key)) return { ok: false, reason: "duplicate" };
    seen.add(definition.key);
    if (!isWidth(entry.width) || !definition.widths.includes(entry.width)) return { ok: false, reason: "width_not_allowed" };
    if (typeof entry.fill !== "boolean") return { ok: false, reason: "bad_entry" };
    entries.push({ key: definition.key, width: entry.width, fill: entry.fill });
  }
  return { ok: true, entries };
}

/**
 * What is stored after a Save: the visible modules the client sent, then the modules the User cannot see, in their
 * stored order (a submitted module whose Permission was just removed is kept as hidden, new at the end).
 */
export function mergeHiddenEntries(submitted: readonly DashboardLayoutEntry[], stored: readonly DashboardLayoutEntry[], has: HasPermission): DashboardLayoutEntry[] {
  const visible = submitted.filter((entry) => isModuleVisible(entry.key, has));
  const hidden = stored.filter((entry) => !isModuleVisible(entry.key, has));
  for (const entry of submitted) if (!isModuleVisible(entry.key, has) && !hidden.some((kept) => kept.key === entry.key)) hidden.push(entry);
  return [...visible, ...hidden];
}

const SPAN_COLUMNS: Record<DashboardWidth, Record<2 | 6, number>> = { third: { 2: 1, 6: 2 }, half: { 2: 1, 6: 3 }, full: { 2: 2, 6: 6 } };

/**
 * The column span of every entry in a grid of `columns` (6 on desktop, 2 on tablets): entries fill rows in order, a
 * module that does not fit starts the next row, and a row that ends with a gap gives it to its Fill modules, split
 * evenly with any remainder going to the last one. On phones the grid has one column and Fill does nothing, so no
 * spans apply.
 */
export function layoutSpans(entries: readonly Pick<DashboardLayoutEntry, "width" | "fill">[], columns: 2 | 6): number[] {
  const spans = entries.map((entry) => SPAN_COLUMNS[entry.width][columns]);
  let start = 0;
  let used = 0;
  const closeRow = (end: number) => {
    const fillers = [];
    for (let i = start; i < end; i++) if (entries[i]!.fill) fillers.push(i);
    const gap = columns - used;
    if (gap > 0 && fillers.length > 0) {
      const each = Math.floor(gap / fillers.length);
      for (const i of fillers) spans[i]! += each;
      spans[fillers[fillers.length - 1]!]! += gap - each * fillers.length;
    }
  };
  for (let i = 0; i < entries.length; i++) {
    if (used + spans[i]! > columns) {
      closeRow(i);
      start = i;
      used = 0;
    }
    used += spans[i]!;
  }
  if (entries.length > 0) closeRow(entries.length);
  return spans;
}

/** Moves one entry. Returns null when the move changes nothing, otherwise the new list and the entry's new 1-based position. */
export function moveEntry(entries: readonly DashboardLayoutEntry[], key: string, direction: MoveDirection): { entries: DashboardLayoutEntry[]; position: number } | null {
  const moved = moveItem(entries, key, direction);
  return moved ? { entries: moved.items, position: moved.position } : null;
}

/** Whether two layouts are the same arrangement (key order, width and Fill). */
export const sameLayout = (a: readonly DashboardLayoutEntry[], b: readonly DashboardLayoutEntry[]): boolean =>
  a.length === b.length && a.every((entry, i) => entry.key === b[i]!.key && entry.width === b[i]!.width && entry.fill === b[i]!.fill);
