// Drag-and-drop glue between an admin Board and the shadcn Carousel (Embla) (ADR-0027, ADR-0026).

/** The pragmatic-drag-and-drop source kind of a Board card. */
export const BOARD_CARD_KIND = "admin-board-card";

const onHandle = (target: EventTarget | null) => target instanceof Element && target.closest("[data-drag-handle]") !== null;

/** Embla's `watchDrag`: a press on a card's top bar is a card drag; anywhere else swipes the carousel (mouse or touch). */
export const swipeUnlessHandle = (_api: unknown, event: MouseEvent | TouchEvent) => !onHandle(event.target);

/**
 * Embla calls `preventDefault()` on every `dragstart` inside its root (to stop image ghost drags), which would
 * cancel the card's native drag before pragmatic (bound on `document`) sees it. Registered in the capture phase on
 * an ancestor of the carousel, this runs first and makes `preventDefault` a no-op for drags started on a handle.
 */
export function keepHandleDrag(event: DragEvent) {
  if (onHandle(event.target)) event.preventDefault = () => {};
}
