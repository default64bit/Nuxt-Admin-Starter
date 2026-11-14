import { describe, expect, it } from "vitest";
import { placeNextTo, placementFromEdge, moveItem } from "~~/shared/utils/sortable";

const items = ["a", "b", "c", "d"].map((key) => ({ key }));
const keys = (list: Array<{ key: string }>) => list.map((item) => item.key).join("");

describe("placementFromEdge (ADR-0032)", () => {
  it("maps the left edge to before in LTR and after in RTL", () => {
    expect(placementFromEdge("left", "ltr")).toBe("before");
    expect(placementFromEdge("left", "rtl")).toBe("after");
  });
  it("maps the right edge to after in LTR and before in RTL", () => {
    expect(placementFromEdge("right", "ltr")).toBe("after");
    expect(placementFromEdge("right", "rtl")).toBe("before");
  });
  it("maps top and bottom the same in both directions", () => {
    for (const dir of ["ltr", "rtl"] as const) {
      expect(placementFromEdge("top", dir)).toBe("before");
      expect(placementFromEdge("bottom", dir)).toBe("after");
    }
  });
});

describe("placeNextTo", () => {
  it("moves an item before or after another and reports its 1-based position", () => {
    expect(placeNextTo(items, "d", "b", "before")).toMatchObject({ position: 2 });
    expect(keys(placeNextTo(items, "d", "b", "before")!.items)).toBe("adbc");
    expect(keys(placeNextTo(items, "a", "c", "after")!.items)).toBe("bcad");
    expect(placeNextTo(items, "a", "c", "after")!.position).toBe(3);
  });
  it("returns null when nothing changes", () => {
    expect(placeNextTo(items, "b", "b", "after")).toBeNull();
    expect(placeNextTo(items, "b", "a", "after")).toBeNull();
    expect(placeNextTo(items, "a", "b", "before")).toBeNull();
    expect(placeNextTo(items, "x", "a", "after")).toBeNull();
  });
  it("keeps a locked first item first with a floor", () => {
    expect(keys(placeNextTo(items, "c", "a", "before", 1)!.items)).toBe("acbd");
    expect(placeNextTo(items, "b", "a", "before", 1)).toBeNull();
  });
});

describe("moveItem (the Move menu)", () => {
  const moved = (result: ReturnType<typeof moveItem<{ key: string }>>) => result && [keys(result.items), result.position];

  it("moves one step or to an end and reports the 1-based position", () => {
    expect(moved(moveItem(items, "c", "start"))).toEqual(["cabd", 1]);
    expect(moved(moveItem(items, "c", "earlier"))).toEqual(["acbd", 2]);
    expect(moved(moveItem(items, "b", "later"))).toEqual(["acbd", 3]);
    expect(moved(moveItem(items, "a", "end"))).toEqual(["bcda", 4]);
  });

  it("returns null when nothing changes or the key is unknown", () => {
    expect(moveItem(items, "a", "start")).toBeNull();
    expect(moveItem(items, "a", "earlier")).toBeNull();
    expect(moveItem(items, "d", "later")).toBeNull();
    expect(moveItem(items, "d", "end")).toBeNull();
    expect(moveItem(items, "x", "end")).toBeNull();
  });
});
