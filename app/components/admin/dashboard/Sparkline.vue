<script setup lang="ts">
import { useChartStyle } from "~/composables/admin/useChartStyle";

// A small line of daily counts (the sparkline). It draws once when it appears, unless the admin prefers
// reduced motion, and has no axes: the figure beside it carries the number. The words are for screen readers. Soft
// draws it in the module's hue; Glow draws a gradient line with a soft halo (the halo exists in dark only); Pro a thin line.
const props = defineProps<{ counts: readonly number[]; label: string }>();
const style = useChartStyle();
const gradientId = useId();
const W = 120;
const H = 32;
const PAD = 2;
const points = computed(() => {
  const max = Math.max(1, ...props.counts);
  const step = props.counts.length > 1 ? (W - PAD * 2) / (props.counts.length - 1) : 0;
  return props.counts.map((count, i) => `${(PAD + i * step).toFixed(1)},${(H - PAD - (count / max) * (H - PAD * 2)).toFixed(1)}`).join(" ");
});
</script>

<template>
  <svg data-slot="sparkline" :data-chart-style="style" :viewBox="`0 0 ${W} ${H}`" dir="ltr" role="img" :aria-label="label" preserveAspectRatio="none" class="h-10 w-full" :class="style === 'glow' ? 'drop-shadow-[0_0_4px_var(--chart-glow-halo)]' : style === 'pro' ? 'text-[var(--chart-pro-ring)]' : 'text-[hsl(var(--dashboard-hue)_70%_38%)] dark:text-[hsl(var(--dashboard-hue)_80%_72%)]'">
    <defs v-if="style === 'glow'">
      <linearGradient :id="gradientId" gradientUnits="userSpaceOnUse" x1="0" y1="0" :x2="W" y2="0">
        <stop offset="0" class="[stop-color:var(--chart-glow-line-from)]" />
        <stop offset="1" class="[stop-color:var(--chart-glow-line-to)]" />
      </linearGradient>
    </defs>
    <polyline :points="points" fill="none" :stroke="style === 'glow' ? `url(#${gradientId})` : 'currentColor'" :stroke-width="style === 'pro' ? 1.25 : 2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" pathLength="1" class="sparkline-line" />
  </svg>
</template>

<style scoped>
.sparkline-line {
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
}
@media (prefers-reduced-motion: no-preference) {
  .sparkline-line {
    animation: sparkline-draw 700ms ease-out both;
  }
}
@keyframes sparkline-draw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>
