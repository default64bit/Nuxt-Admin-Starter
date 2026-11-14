<script setup lang="ts">
// The frame of one Board card (ADR-0027): a top bar that is the drag handle of a movable card (anywhere else swipes
// the carousel), and a body. The page's own non-drag way to move the card is a button in the body. While held, the
// pointer carries a tilted copy of the whole card and the original shows as an empty dashed slot.
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { GripHorizontal } from "@lucide/vue";
import { BOARD_CARD_KIND } from "./board-drag";

const props = defineProps<{
  id: string;
  /** The key of the column the card is in. */
  column: string;
  /** Whether the viewer may move this card (draws the grip and registers the drag). */
  movable: boolean;
  highlighted?: boolean;
  /** Hover text of the grip, e.g. "Drag to Resolved". */
  handleTitle?: string;
}>();
defineSlots<{ bar(): unknown; default(): unknown }>();
const { locale } = useI18n();
const tilt = computed(() => (locale.value === "en" ? 3 : -3));

const root = ref<HTMLElement | null>(null);
const handle = ref<HTMLElement | null>(null);
const dragging = ref(false);
let cleanup: (() => void) | undefined;
function register() {
  cleanup?.();
  cleanup = undefined;
  if (!root.value || !handle.value || !props.movable) return;
  const card = root.value;
  cleanup = draggable({
    element: handle.value,
    getInitialData: () => ({ kind: BOARD_CARD_KIND, id: props.id, column: props.column }),
    onGenerateDragPreview: ({ nativeSetDragImage, location }) => {
      const rect = card.getBoundingClientRect();
      const pad = 24;
      setCustomNativeDragPreview({
        nativeSetDragImage,
        getOffset: () => ({ x: location.current.input.clientX - rect.left + pad, y: location.current.input.clientY - rect.top + pad }),
        render: ({ container }) => {
          const frame = document.createElement("div");
          frame.style.padding = `${pad}px`;
          const clone = card.cloneNode(true) as HTMLElement;
          clone.style.width = `${rect.width}px`;
          clone.style.transform = `rotate(${tilt.value}deg)`;
          clone.style.boxShadow = "0 18px 40px -12px rgb(0 0 0 / 0.45)";
          frame.appendChild(clone);
          container.appendChild(frame);
        },
      });
    },
    onDragStart: () => (dragging.value = true),
    onDrop: () => (dragging.value = false),
  });
}
onMounted(() => watch(() => [props.movable, props.id, props.column], register, { immediate: true, flush: "post" }));
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <article
    ref="root"
    data-slot="board-card"
    :data-card-id="id"
    :data-column="column"
    class="bg-card text-card-foreground relative rounded-xl border transition-[border-color,box-shadow] select-none"
    :class="[dragging ? 'border-foreground/25 border-dashed bg-transparent shadow-none' : 'shadow-xs', highlighted ? 'ring-primary ring-2' : '', movable ? 'hover:border-foreground/20 hover:shadow-md' : '']"
  >
    <div :class="dragging ? 'invisible' : ''">
      <div
        ref="handle"
        data-slot="board-card-bar"
        :data-drag-handle="movable ? '' : undefined"
        class="relative z-10 flex flex-wrap items-center gap-1.5 rounded-t-xl border-b px-3.5 py-2"
        :class="movable ? 'bg-muted/50 hover:bg-muted cursor-grab transition-colors active:cursor-grabbing' : 'bg-muted/25'"
        :title="movable ? handleTitle : undefined"
      >
        <GripHorizontal v-if="movable" class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <slot name="bar" />
      </div>
      <div class="grid gap-3 p-3.5"><slot /></div>
    </div>
  </article>
</template>
