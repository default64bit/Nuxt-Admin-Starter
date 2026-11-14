<script setup lang="ts">
// Pro's thin ring for a rate (0–100): a faint track and an arc of the rate drawn from the top. Decorative: the figure
// beside it carries the number.
const props = defineProps<{ value: number }>();
const arc = computed(() => Math.min(100, Math.max(0, props.value)));
</script>

<template>
  <svg data-slot="rate-ring" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false" dir="ltr" class="size-auto h-8 w-8 shrink-0 -rotate-90">
    <circle cx="16" cy="16" r="13" fill="none" stroke-width="2" class="[stroke:var(--chart-pro-track)]" />
    <circle cx="16" cy="16" r="13" fill="none" stroke-width="2" stroke-linecap="round" pathLength="100" :stroke-dasharray="`${arc} 100`" class="[stroke:var(--chart-pro-ring)]" />
  </svg>
</template>
