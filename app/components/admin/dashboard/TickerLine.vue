<script setup lang="ts">
// Pro's ticker mark beside a change: a short line that rises, falls or stays level, green when the change is the
// good way and red when it is the bad way (a rise in a failure count is bad). Decorative: the change text carries the
// meaning, so it is never told by colour alone.
defineProps<{ direction: "up" | "down" | "flat"; good: boolean }>();
</script>

<template>
  <svg data-slot="ticker-line" :data-direction="direction" viewBox="0 0 24 10" width="24" height="10" aria-hidden="true" focusable="false" dir="ltr" class="size-auto h-2.5 w-6 shrink-0" :class="direction === 'flat' ? 'text-muted-foreground' : good ? 'text-[var(--chart-pro-bar)]' : 'text-[var(--chart-pro-bar-negative)]'">
    <polyline :points="direction === 'up' ? '1,8 8,5 14,6 23,1.5' : direction === 'down' ? '1,2 8,5 14,4 23,8.5' : '1,5 23,5'" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
