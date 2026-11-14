<script setup lang="ts">
import { useSortableItem } from "~/composables/admin/useSortableItem";
import type { Placement } from "~~/shared/utils/sortable";

// One module cell of the Dashboard grid. In Customize mode it is a drop target (and draggable by its grip); a bar on the side the module would land on shows where a drop goes. `enabled` defaults to false explicitly.
const props = withDefaults(defineProps<{ itemKey: string; enabled?: boolean }>(), { enabled: false });
const emit = defineEmits<{ drop: [sourceKey: string, targetKey: string, placement: Placement] }>();
const element = ref<HTMLElement | null>(null);
const { indicator, dragging } = useSortableItem({
  element,
  handleSelector: '[data-slot="dashboard-grip"]',
  active: () => props.enabled,
  itemKey: () => props.itemKey,
  onDrop: (...args) => emit("drop", ...args),
});
// "before" is at the start edge in reading order, "after" at the end edge (logical classes follow the direction).
defineExpose({ element });
</script>

<template>
  <li ref="element" :data-dragging="dragging || undefined" :data-drop="indicator?.placement" :class="dragging && 'opacity-60'">
    <slot />
    <span
      v-if="indicator"
      aria-hidden="true"
      data-slot="dashboard-drop-indicator"
      :class="['bg-primary pointer-events-none absolute inset-y-0 z-20 w-1 rounded-full', indicator.placement === 'before' ? '-inset-s-2.5' : '-inset-e-2.5']"
    />
  </li>
</template>
