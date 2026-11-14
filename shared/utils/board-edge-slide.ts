/**
 * Where a held, dragged Board card slides the carousel: near the start edge back, near the end edge forward (`dir`
 * decides which physical edge is the end), otherwise nowhere. `zone` is the width of the sensitive strip in pixels.
 */
export function edgeSlide(pointerX: number, rect: { left: number; right: number }, dir: "ltr" | "rtl", zone: number): "prev" | "next" | null {
  const nearLeft = pointerX >= rect.left - 8 && pointerX < rect.left + zone;
  const nearRight = pointerX <= rect.right + 8 && pointerX > rect.right - zone;
  if (!nearLeft && !nearRight) return null;
  const forward = dir === "rtl" ? nearLeft : nearRight;
  return forward ? "next" : "prev";
}
