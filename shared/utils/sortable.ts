/** The physical edges the hitbox reports. */
export type PhysicalEdge = "left" | "right" | "top" | "bottom";
export type Placement = "before" | "after";

/**
 * Maps the hitbox's closest physical edge to "before" or "after" in reading order, using the container's direction
 * (ADR-0032): the left edge is "before" in LTR and "after" in RTL; top is always before and bottom always after.
 */
export function placementFromEdge(edge: PhysicalEdge | null, dir: "ltr" | "rtl"): Placement {
  if (edge === "top") return "before";
  if (edge === "bottom") return "after";
  if (edge === "left") return dir === "rtl" ? "after" : "before";
  return dir === "rtl" ? "before" : "after";
}

/**
 * Moves the item with `key` next to the item with `targetKey`. `floor` is the first index a moved item may take
 * (a locked first item holds 0). Returns null when nothing changes (same item, unknown key, or the same place).
 */
export function placeNextTo<T extends { key: string }>(items: readonly T[], key: string, targetKey: string, placement: Placement, floor = 0): { items: T[]; position: number } | null {
  const from = items.findIndex((item) => item.key === key);
  const target = items.findIndex((item) => item.key === targetKey);
  if (from === -1 || target === -1 || from === target) return null;
  const rest = items.filter((item) => item.key !== key);
  const at = rest.findIndex((item) => item.key === targetKey) + (placement === "after" ? 1 : 0);
  const to = Math.max(floor, at);
  if (to === from) return null;
  rest.splice(to, 0, items[from]!);
  return { items: rest, position: to + 1 };
}

/** The Move menu's choices (ADR-0032): the single-pointer and keyboard path beside every drag grip. */
export type MoveDirection = "start" | "earlier" | "later" | "end";

/** Moves the item with `key` one step or to an end. Returns null when nothing changes (unknown key or already there). */
export function moveItem<T extends { key: string }>(items: readonly T[], key: string, direction: MoveDirection): { items: T[]; position: number } | null {
  const from = items.findIndex((item) => item.key === key);
  if (from === -1) return null;
  const last = items.length - 1;
  const to = direction === "start" ? 0 : direction === "end" ? last : Math.min(last, Math.max(0, from + (direction === "earlier" ? -1 : 1)));
  if (to === from) return null;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return { items: next, position: to + 1 };
}
