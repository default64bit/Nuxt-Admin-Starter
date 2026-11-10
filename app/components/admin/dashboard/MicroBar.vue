<script setup lang="ts">
// Pro's micro bar in a table row: a thin bar of `value` against the largest `max` of the table. Decorative: the row's
// own figure carries the number. Drawn with SVG attributes (no inline style); it grows from the reading start, so it is
// mirrored in `fa`.
const props = defineProps<{ value: number; max: number }>();
const share = computed(() => (props.max > 0 ? Math.min(100, Math.max(0, (props.value / props.max) * 100)) : 0));
</script>

<template>
  <svg data-slot="micro-bar" :data-share="Math.round(share)" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false" class="block h-1 w-full rtl:-scale-x-100">
    <rect x="0" y="0" width="100" height="4" rx="2" class="[fill:var(--chart-pro-track)]" />
    <rect v-if="share > 0" x="0" y="0" :width="share" height="4" rx="2" class="[fill:var(--chart-pro-ring)]" />
  </svg>
</template>
