<script setup lang="ts">
import type { ChartStyle } from "~~/shared/schemas/admin-dashboard";

// A small preview of a Chart style for the picker: five bars drawn with that style's own named colours, so it follows
// the theme. Decorative (the style's name beside it carries the meaning).
defineProps<{ style: ChartStyle }>();
const gradientId = useId();
const BARS = [10, 18, 13, 22, 16] as const;
</script>

<template>
  <svg data-slot="chart-style-thumbnail" :data-style="style" viewBox="0 0 60 28" width="60" height="28" aria-hidden="true" focusable="false" class="size-auto h-7 w-[60px] shrink-0" dir="ltr">
    <defs v-if="style === 'glow'">
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="[stop-color:var(--chart-glow-bar)]" />
        <stop offset="1" class="[stop-color:var(--chart-glow-bar-fade)]" />
      </linearGradient>
    </defs>
    <template v-if="style === 'pro'">
      <rect v-for="(height, index) in BARS" :key="`count-${index}`" :x="3 + index * 11" :y="26 - height" width="9" :height="height" rx="1.5" class="[fill:var(--chart-pro-bar-dim)]" opacity="0.5" />
      <rect v-for="(height, index) in BARS" :key="`net-${index}`" :x="6 + index * 11" :y="24 - height" width="3" :height="height - 2" rx="1" :class="index === 1 ? '[fill:var(--chart-pro-bar-negative)]' : '[fill:var(--chart-pro-bar)]'" />
    </template>
    <rect
      v-for="(height, index) in BARS"
      v-else
      :key="index"
      :x="4 + index * 11"
      :y="26 - height"
      width="7"
      :height="height"
      :rx="style === 'glow' ? 3.5 : 2.5"
      :fill="style === 'glow' ? `url(#${gradientId})` : 'var(--chart-soft-bar)'"
      :class="style === 'glow' && index !== 3 && 'opacity-60'"
    />
  </svg>
</template>
