// @vitest-environment node
import { describe, expect, it } from "vitest";
import { defaultLayout, layoutSpans, mergeHiddenEntries, moveEntry, repairLayout, sameLayout, validateArrangement, visibleEntries, type DashboardLayoutEntry } from "~~/shared/utils/dashboard-layout";

const entry = (key: string, width: DashboardLayoutEntry["width"] = "third", fill = false): DashboardLayoutEntry => ({ key, width, fill });
const only = (...keys: string[]) => (key: string) => keys.includes(key);

describe("the default and a repaired layout", () => {
  it("lists the registry's default modules in order, and skips the ones a User may not see", () => {
    expect(defaultLayout()).toEqual([entry("new-accounts")]);
    expect(visibleEntries(defaultLayout(), only("view-users"))).toEqual([entry("new-accounts")]);
    expect(visibleEntries(defaultLayout(), only())).toEqual([]);
  });

  it("repairs a stored document leniently: unknown keys and duplicates drop, a width the module no longer offers resets", () => {
    const stored = { version: 1, modules: [{ key: "gone", width: "full", fill: true }, { key: "new-accounts", width: "full", fill: true }, { key: "new-accounts", width: "half", fill: false }, "junk"] };
    expect(repairLayout(stored)).toEqual([entry("new-accounts", "third", true)]);
    expect(repairLayout({ version: 1, modules: [{ key: "new-accounts", width: "half", fill: false }] })).toEqual([entry("new-accounts", "half")]);
  });

  it("repairs anything that is not a version-1 document to the default", () => {
    for (const stored of [null, undefined, "x", [], { version: 2, modules: [] }, { version: 1 }]) expect(repairLayout(stored)).toEqual(defaultLayout());
  });
});

describe("the strict save check", () => {
  it("accepts a valid draft, including an empty one", () => {
    expect(validateArrangement([])).toEqual({ ok: true, entries: [] });
    expect(validateArrangement([{ key: "new-accounts", width: "half", fill: true }])).toEqual({ ok: true, entries: [entry("new-accounts", "half", true)] });
  });

  it.each([
    ["not a list", { key: "new-accounts" }],
    ["an unknown key", [{ key: "gone", width: "third", fill: false }]],
    ["a duplicate", [entry("new-accounts"), entry("new-accounts")]],
    ["a width the module does not allow", [{ key: "new-accounts", width: "full", fill: false }]],
    ["an extra field", [{ key: "new-accounts", width: "third", fill: false, range: "today" }]],
    ["a non-boolean fill", [{ key: "new-accounts", width: "third", fill: "yes" }]],
    ["more entries than the registry holds", [entry("new-accounts"), entry("a"), entry("b")]],
  ])("rejects %s", (_name, raw) => {
    expect(validateArrangement(raw).ok).toBe(false);
  });

  it("keeps the modules a User cannot see after the visible ones they sent", () => {
    const stored = [entry("hidden-a"), entry("new-accounts")];
    const merged = mergeHiddenEntries([entry("new-accounts", "half")], stored, only("view-users"));
    expect(merged.map((e) => e.key)).toEqual(["new-accounts"]);
    expect(mergeHiddenEntries([entry("new-accounts")], [entry("new-accounts", "half")], only())).toEqual([entry("new-accounts", "half")]);
  });
});

describe("the grid and the draft operations", () => {
  it("packs rows left to right, wraps a module that does not fit and gives a row's gap to its Fill modules", () => {
    const row = (...items: [DashboardLayoutEntry["width"], boolean][]) => items.map(([width, fill]) => entry("x", width, fill));
    expect(layoutSpans(row(["third", false], ["half", false]), 6)).toEqual([2, 3]);
    expect(layoutSpans(row(["half", false], ["half", false], ["third", false]), 6)).toEqual([3, 3, 2]);
    expect(layoutSpans(row(["third", true], ["half", false]), 6)).toEqual([3, 3]);
    expect(layoutSpans(row(["third", true], ["third", true], ["third", true]), 2)).toEqual([1, 1, 2]);
    expect(layoutSpans(row(["half", true]), 2)).toEqual([2]);
  });

  it("moves an entry to a place and reports its 1-based position, or null when nothing changes", () => {
    const list = [entry("a"), entry("b"), entry("c")];
    expect(moveEntry(list, "a", "end")).toMatchObject({ position: 3, entries: [entry("b"), entry("c"), entry("a")] });
    expect(moveEntry(list, "c", "earlier")?.entries.map((e) => e.key)).toEqual(["a", "c", "b"]);
    expect(moveEntry(list, "a", "start")).toBeNull();
    expect(moveEntry(list, "zzz", "end")).toBeNull();
  });

  it("compares layouts by order, width and Fill", () => {
    expect(sameLayout([entry("a"), entry("b")], [entry("a"), entry("b")])).toBe(true);
    expect(sameLayout([entry("a"), entry("b")], [entry("b"), entry("a")])).toBe(false);
    expect(sameLayout([entry("a")], [entry("a", "half")])).toBe(false);
  });
});
