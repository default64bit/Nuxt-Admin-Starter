import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { placementFromEdge, type Placement } from "~~/shared/utils/sortable";

const KIND = "admin-sortable";

/** Where a dragged item would land: the item it is over and which side of it, in reading order. */
export interface DropIndicator {
  key: string;
  placement: Placement;
}

/**
 * Drag and drop for one sortable item (ADR-0026). The grip is the
 * drag handle and the item is the drop target; the closest physical edge is mapped to before/after with the
 * container's `dir`. `axis` is "x" for a wrapping grid and "y" for a one-column list. Keyboard and single-pointer
 * users move items with the Move menu instead.
 */
export function useSortableItem(options: {
  element: Ref<HTMLElement | null>;
  /** CSS selector of the grip inside the item; it is looked up whenever the item becomes active. */
  handleSelector: string;
  /** Registered only while true (Customize mode). */
  active: () => boolean;
  itemKey: () => string;
    axis?: "x" | "y";
  onDrop: (sourceKey: string, targetKey: string, placement: Placement) => void;
}) {
  const indicator = ref<DropIndicator | null>(null);
  const dragging = ref(false);
  const { axis = "x" } = options;
  const direction = (element: HTMLElement) => (getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr");

  let cleanup: (() => void) | undefined;
  function register() {
    cleanup?.();
    cleanup = undefined;
    indicator.value = null;
    const element = options.element.value;
    if (!element || !options.active()) return;
    const parts = [
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data.kind === KIND && source.data.key !== options.itemKey(),
        getData: ({ input, element: target }) =>
          attachClosestEdge({ key: options.itemKey() }, { input, element: target, allowedEdges: axis === "x" ? ["left", "right"] : ["top", "bottom"] }),
        onDrag: ({ self }) => {
          indicator.value = { key: options.itemKey(), placement: placementFromEdge(extractClosestEdge(self.data), direction(element)) };
        },
        onDragLeave: () => (indicator.value = null),
        onDrop: () => (indicator.value = null),
      }),
    ];
    const handle = element.querySelector<HTMLElement>(options.handleSelector);
    if (handle) {
      parts.push(
        draggable({
          element,
          dragHandle: handle,
          getInitialData: () => ({ kind: KIND, key: options.itemKey() }),
          onDragStart: () => (dragging.value = true),
          onDrop: () => (dragging.value = false),
        }),
      );
    }
    cleanup = combine(...parts);
  }
  onMounted(() => watch(options.active, register, { flush: "post", immediate: true }));
  onBeforeUnmount(() => cleanup?.());

  return { indicator, dragging };
}

/** One monitor per list: reports each finished drop as (dragged key, target key, placement). */
export function useSortableMonitor(onDrop: (sourceKey: string, targetKey: string, placement: Placement) => void, enabled: () => boolean = () => true) {
  let cleanup: (() => void) | undefined;
  onMounted(() => {
    cleanup = monitorForElements({
      canMonitor: ({ source }) => source.data.kind === KIND && enabled(),
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target) return;
        const element = target.element;
        const dir = getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
        onDrop(String(source.data.key), String(target.data.key), placementFromEdge(extractClosestEdge(target.data), dir));
      },
    });
  });
  onBeforeUnmount(() => cleanup?.());
}
