<script setup lang="ts">
import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-vue";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useChartStyle } from "~/composables/admin/useChartStyle";
import RateRing from "./RateRing.vue";
import TickerLine from "./TickerLine.vue";

// One rate: the label, the percentage (one decimal) and its change from the previous period in percentage points.
// A rate with no denominator shows "—" and the `empty` line, never 0%; with nothing to compare against the change is
// "—". Up and down are told by sign and arrow, never by colour alone. In Pro a thin ring and a ticker line join it.
// `lowerIsBetter` flips the colours of an up and a down change.
const props = defineProps<{ label: string; value: number | null; previous: number | null; empty: string; lowerIsBetter?: boolean }>();
const { t, decimal } = useAdminFormat();
const chartStyle = useChartStyle();
const points = computed(() => (props.value === null || props.previous === null ? null : Math.round((props.value - props.previous) * 10) / 10));
const direction = computed(() => (points.value === null || points.value === 0 ? "flat" : points.value > 0 ? "up" : "down"));
const changeText = computed(() => (points.value === null ? "—" : `${points.value > 0 ? "+" : points.value < 0 ? "−" : ""}${t("admin.dashboard.figure.points", { n: decimal(Math.abs(points.value)) })}`));
const changeSpoken = computed(() => {
  if (points.value === null) return t("admin.dashboard.figure.changeNone");
  const n = decimal(Math.abs(points.value));
  return points.value > 0 ? t("admin.dashboard.figure.pointsUp", { n }) : points.value < 0 ? t("admin.dashboard.figure.pointsDown", { n }) : t("admin.dashboard.figure.changeFlat");
});
</script>

<template>
  <div data-slot="rate-figure" class="flex flex-col gap-0.5">
    <dt class="text-muted-foreground text-xs">{{ label }}</dt>
    <dd class="m-0 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span class="flex items-center gap-2">
        <RateRing v-if="chartStyle === 'pro' && value !== null" :value="value" />
        <span class="flex flex-col">
          <span data-slot="rate-figure-value" class="text-xl font-semibold tabular-nums" dir="auto">{{ value === null ? "—" : t("admin.dashboard.figure.rate", { n: decimal(value) }) }}</span>
          <span v-if="value === null" data-slot="rate-figure-empty" class="text-muted-foreground text-xs">{{ empty }}</span>
        </span>
      </span>
      <span class="inline-flex items-center gap-2">
        <TickerLine v-if="chartStyle === 'pro' && points !== null" :direction="direction" :good="(direction === 'up') !== !!lowerIsBetter" />
        <span
          data-slot="rate-figure-change"
          data-chart-part="change"
          :data-change="direction"
          class="inline-flex items-center gap-0.5 text-xs font-medium tabular-nums"
          :class="direction === 'flat' ? 'text-muted-foreground' : (direction === 'up') !== !!lowerIsBetter ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'"
        >
          <IconArrowUpRight v-if="direction === 'up'" class="size-3.5" aria-hidden="true" />
          <IconArrowDownRight v-else-if="direction === 'down'" class="size-3.5" aria-hidden="true" />
          <span aria-hidden="true">{{ changeText }}</span>
          <span class="sr-only">{{ changeSpoken }}</span>
        </span>
      </span>
    </dd>
  </div>
</template>
