<script setup lang="ts">
import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-vue";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useChartStyle } from "~/composables/admin/useChartStyle";
import { useCountUp } from "~/composables/admin/useCountUp";
import { changeOf } from "~~/shared/utils/business-calendar";
import TickerLine from "./TickerLine.vue";

// A count with its change from the previous period: the label, the value (counting up once) and the change. The change
// is a % with an arrow, "New" when the previous value is 0, "—" when both are 0; up and down are told by sign and
// arrow, never by colour alone. A figure with no value shows "—". In Pro a ticker line sits beside the change.
// `lowerIsBetter` flips the colours of an up and a down change (a rise in failures is not praised).
const props = defineProps<{ label: string; value: number | null; previous: number | null; lowerIsBetter?: boolean }>();
const { t, num, digits } = useAdminFormat();
const chartStyle = useChartStyle();
const shown = useCountUp(computed(() => props.value ?? 0));
const text = computed(() => (props.value === null ? "—" : num(shown.value)));
const change = computed(() => changeOf(props.value ?? 0, props.previous ?? 0));
const percent = computed(() => (change.value.kind === "percent" ? change.value.percent : 0));
// At most one decimal; `fa` uses its own decimal separator.
const formatPercent = (value: number) => {
  const formatted = num(new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Math.abs(value)));
  return digits.value === "fa" ? formatted.replace(".", "٫") : formatted;
};
const changeText = computed(() => {
  if (change.value.kind === "new") return t("admin.dashboard.figure.new");
  if (change.value.kind === "none") return "—";
  return `${percent.value > 0 ? "+" : percent.value < 0 ? "−" : ""}${formatPercent(percent.value)}%`;
});
const changeSpoken = computed(() => {
  if (change.value.kind === "new") return t("admin.dashboard.figure.changeNew");
  if (change.value.kind === "none") return t("admin.dashboard.figure.changeNone");
  const amount = formatPercent(percent.value);
  return percent.value > 0 ? t("admin.dashboard.figure.changeUp", { percent: amount }) : percent.value < 0 ? t("admin.dashboard.figure.changeDown", { percent: amount }) : t("admin.dashboard.figure.changeFlat");
});
const direction = computed(() => (percent.value > 0 ? "up" : percent.value < 0 ? "down" : "flat"));
</script>

<template>
  <div data-slot="value-delta-figure" class="flex flex-col gap-0.5">
    <dt class="text-muted-foreground text-xs">{{ label }}</dt>
    <dd class="m-0 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span data-slot="value-delta-value" class="text-xl font-semibold tabular-nums" dir="auto">{{ text }}</span>
      <span class="inline-flex items-center gap-2">
        <TickerLine v-if="chartStyle === 'pro' && change.kind === 'percent'" :direction="direction" :good="(direction === 'up') !== !!lowerIsBetter" />
        <span
          data-slot="value-delta-change"
          data-chart-part="change"
          :data-change="change.kind === 'percent' ? direction : change.kind"
          class="inline-flex items-center gap-0.5 text-xs font-medium tabular-nums"
          :class="direction === 'flat' ? 'text-muted-foreground' : (direction === 'up') !== !!lowerIsBetter ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'"
        >
          <IconArrowUpRight v-if="change.kind === 'percent' && direction === 'up'" class="size-3.5" aria-hidden="true" />
          <IconArrowDownRight v-else-if="change.kind === 'percent' && direction === 'down'" class="size-3.5" aria-hidden="true" />
          <span aria-hidden="true">{{ changeText }}</span>
          <span class="sr-only">{{ changeSpoken }}</span>
        </span>
      </span>
    </dd>
  </div>
</template>
