<!-- demo-ticket:start (whole file) -->
<script setup lang="ts">
import { BarController, BarElement, CategoryScale, Chart as ChartJS, LinearScale, type ChartOptions, type ScriptableContext } from "chart.js";
import { Bar } from "vue-chartjs";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useChartStyle } from "~/composables/admin/useChartStyle";
import { useChartTheme } from "~/composables/admin/useChartTheme";
import { compactTick, dayLabel, dayPeriod } from "~~/shared/utils/chart-format";

// The Demo tickets created per day bar chart, in the admin's Chart style: Soft (flat pill bars), Glow (bars that fade
// into the card, the others dimmed while one is in focus) or Pro (thin bars). This file, with chart.js and vue-chartjs,
// is the one lazy chunk (ADR-0025): it registers only the parts a bar chart uses and is loaded by the module once the
// chart scrolls into view after hydration. Our own HTML tooltip replaces the library's: hover or tap shows it,
// Left/Right step it in visual direction and Escape hides it. The canvas draws left to right (`direction: ltr`) and
// `fa` mirrors the axis (newest at the left, the y-axis on the right).
ChartJS.register(BarController, BarElement, CategoryScale, LinearScale);

const props = defineProps<{ days: readonly { day: string; count: number }[]; summary: string; seriesLabel: string }>();
const { locale, num } = useAdminFormat();
const lang = computed<"fa" | "en">(() => (locale.value === "en" ? "en" : "fa"));
const mirrored = computed(() => lang.value === "fa");
const chartStyle = useChartStyle();
const tokens = useChartTheme(chartStyle);

const reducedMotion = ref(false);
const narrow = ref(false);
onMounted(() => {
  reducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const query = window.matchMedia("(max-width: 639px)");
  narrow.value = query.matches;
  query.addEventListener("change", (event) => (narrow.value = event.matches));
});

const active = ref<number | null>(null);
const chartRef = ref<{ chart?: ChartJS } | null>(null);
const frame = ref<HTMLElement | null>(null);
const announcement = ref("");
const tip = reactive({ left: 0, top: 0 });
const tooltip = computed(() => {
  const entry = active.value === null ? null : props.days[active.value];
  return entry ? { period: dayPeriod(entry.day, lang.value), count: num(entry.count) } : null;
});

function place(index: number | null) {
  active.value = index;
  const chart = chartRef.value?.chart;
  const element = index === null ? undefined : chart?.getDatasetMeta(0).data[index];
  if (index === null || !element || !frame.value) {
    announcement.value = "";
    return;
  }
  tip.left = Math.min(Math.max(element.x, 70), Math.max(70, frame.value.clientWidth - 70));
  tip.top = Math.max(0, element.y - 8);
  const entry = props.days[index]!;
  nextTick(() => (announcement.value = `${dayPeriod(entry.day, lang.value)}: ${props.seriesLabel} ${num(entry.count)}`));
}
const indexAt = (event: PointerEvent): number | null => {
  const chart = chartRef.value?.chart;
  const hit = chart?.getElementsAtEventForMode(event, "index", { intersect: false }, false)[0];
  return hit ? hit.index : null;
};
const onPointer = (event: PointerEvent) => {
  const index = indexAt(event);
  if (index !== null) place(index);
};
const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Escape") return place(null);
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const last = props.days.length - 1;
  // Data runs oldest to newest; in `fa` the newest is at the left, so visual Left is one step newer.
  const step = (event.key === "ArrowRight" ? 1 : -1) * (mirrored.value ? -1 : 1);
  place(active.value === null ? (step > 0 ? 0 : last) : Math.min(last, Math.max(0, active.value + step)));
};
watch(
  () => props.days,
  () => place(active.value === null ? null : Math.min(active.value, props.days.length - 1)),
);

/** Glow: each bar is a gradient from its solid end to the card at the baseline; the others dim while one is in focus. */
function glowFill(context: ScriptableContext<"bar">): CanvasGradient | string {
  const palette = tokens.value;
  const dimmed = active.value !== null && active.value !== context.dataIndex;
  const solid = dimmed ? palette.barDim : palette.bar;
  const element = context.chart.getDatasetMeta(context.datasetIndex).data[context.dataIndex] as unknown as { y?: number; base?: number } | undefined;
  if (!element || element.y === undefined || element.base === undefined) return solid;
  const gradient = context.chart.ctx.createLinearGradient(0, element.y, 0, element.base === element.y ? element.y + 1 : element.base);
  gradient.addColorStop(0, solid);
  gradient.addColorStop(1, dimmed ? palette.barDimFade : palette.barFade);
  return gradient;
}

const data = computed(() => ({
  labels: props.days.map((entry) => dayLabel(entry.day, lang.value)),
  datasets: [
    {
      label: props.seriesLabel,
      data: props.days.map((entry) => entry.count),
      backgroundColor: chartStyle.value === "glow" ? glowFill : tokens.value.bar,
      borderColor: props.days.map((_, index) => (index === active.value ? tokens.value.focus : "transparent")),
      borderWidth: 2,
      borderRadius: chartStyle.value === "glow" ? 14 : chartStyle.value === "pro" ? 2 : 6,
      borderSkipped: false as const,
      maxBarThickness: chartStyle.value === "pro" ? 8 : 32,
      minBarLength: 3,
    },
  ],
}));

const allZero = computed(() => props.days.every((entry) => entry.count === 0));
const options = computed<ChartOptions<"bar">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: reducedMotion.value ? false : { duration: 700 },
  events: [],
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: {
    x: { reverse: mirrored.value, grid: { display: false }, border: { display: false }, ticks: { color: tokens.value.text, maxRotation: 0, minRotation: 0, autoSkip: true, maxTicksLimit: narrow.value ? 5 : 10 } },
    y: {
      position: mirrored.value ? "right" : "left",
      beginAtZero: true,
      suggestedMax: allZero.value ? 1 : undefined,
      border: { display: false },
      grid: { color: tokens.value.grid },
      ticks: { color: tokens.value.text, maxTicksLimit: 5, precision: 0, callback: (value) => compactTick(Number(value), lang.value) },
    },
  },
}));
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      ref="frame"
      data-slot="demo-ticket-trend-chart"
      :data-chart-style="chartStyle"
      tabindex="0"
      role="img"
      :aria-label="summary"
      class="focus-visible:ring-ring/50 relative h-56 w-full touch-pan-y rounded-md outline-none select-none focus-visible:ring-[3px] sm:h-64 [direction:ltr]"
      @pointerdown="onPointer"
      @pointermove="(event) => event.pointerType === 'mouse' && onPointer(event)"
      @pointerleave="place(null)"
      @keydown="onKeyDown"
      @blur="place(null)"
    >
      <Bar ref="chartRef" :data="data" :options="options" aria-hidden="true" />
      <div
        v-if="tooltip"
        data-slot="demo-ticket-trend-tooltip"
        :dir="mirrored ? 'rtl' : 'ltr'"
        class="bg-popover text-popover-foreground pointer-events-none absolute z-10 w-max max-w-44 -translate-x-1/2 -translate-y-full rounded-md border px-3 py-2 text-xs shadow-md"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
      >
        <p class="m-0 font-medium">{{ tooltip.period }}</p>
        <p class="m-0 tabular-nums">{{ seriesLabel }}: {{ tooltip.count }}</p>
      </div>
    </div>
    <p class="sr-only" role="status" aria-live="polite" data-slot="demo-ticket-trend-announcement">{{ announcement }}</p>
  </div>
</template>
<!-- demo-ticket:end -->
