<script setup lang="ts">
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useChartStyle } from "~/composables/admin/useChartStyle";
import { dashboardModule } from "~~/shared/constants/dashboard-modules";
import ChartStyleThumbnail from "./ChartStyleThumbnail.vue";
import MicroBar from "./MicroBar.vue";
import RateFigure from "./RateFigure.vue";
import Sparkline from "./Sparkline.vue";
import ValueDeltaFigure from "./ValueDeltaFigure.vue";

// The sample inside a Choose modules card: a small drawing of the module's preview kind (from the registry) with FIXED
// illustrative numbers, in the User's Chart style (the same figure, ring, micro-bar and sparkline parts the real
// modules use). It never reads real data, has no links and is hidden from assistive technology: the card's checkbox
// and the visible "Sample" label carry the meaning.
const props = defineProps<{ moduleKey: string }>();
const { t, num } = useAdminFormat();
const style = useChartStyle();
const SPARK = [2, 3, 2, 5, 4, 6, 5, 8] as const;
const QUEUES = [2, 5, 1] as const;
const STAGES = [3, 7, 4, 2] as const;
const RANKED = [12, 8, 5] as const;
const kind = computed(() => dashboardModule(props.moduleKey)?.preview ?? "figures");
</script>

<template>
  <div data-slot="module-sample" :data-sample-kind="kind" :data-chart-style="style" aria-hidden="true" inert class="pointer-events-none flex min-h-24 flex-col justify-center gap-2 text-sm select-none">
    <ul v-if="kind === 'attention'" class="m-0 grid list-none gap-1 p-0">
      <li v-for="(count, i) in QUEUES" :key="i" class="flex items-center justify-between gap-3">
        <span class="text-xs">{{ t("admin.dashboard.sample.queue", { n: num(i + 1) }) }}</span>
        <span class="font-semibold tabular-nums">{{ num(count) }}</span>
      </li>
    </ul>
    <div v-else-if="kind === 'bars'" class="flex justify-center"><ChartStyleThumbnail :style="style" class="!h-16 !w-full max-w-60" /></div>
    <ul v-else-if="kind === 'pipeline'" class="m-0 grid list-none gap-1 p-0">
      <li v-for="(count, i) in STAGES" :key="i" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span class="text-xs">{{ t("admin.dashboard.sample.stage", { n: num(i + 1) }) }}</span>
        <span class="font-semibold tabular-nums">{{ num(count) }}</span>
        <MicroBar v-if="style === 'pro'" :value="count" :max="7" class="basis-full" />
      </li>
    </ul>
    <ol v-else-if="kind === 'ranking'" class="m-0 grid list-none gap-1.5 p-0">
      <li v-for="(count, i) in RANKED" :key="i" class="flex flex-col gap-1">
        <span class="flex items-center justify-between gap-3 text-xs">
          <span>{{ num(i + 1) }}</span>
          <span class="font-semibold tabular-nums">{{ num(count) }}</span>
        </span>
        <MicroBar v-if="style === 'pro'" :value="count" :max="12" />
      </li>
    </ol>
    <div v-else-if="kind === 'sparkline'" class="grid gap-2">
      <dl class="m-0"><ValueDeltaFigure :label="t('admin.dashboard.sample.figure')" :value="18" :previous="12" /></dl>
      <Sparkline :counts="SPARK" label="" />
    </div>
    <dl v-else-if="kind === 'rates'" class="m-0 grid gap-3">
      <RateFigure :label="t('admin.dashboard.sample.rate', { n: num(1) })" :value="72.5" :previous="69" :empty="''" />
      <RateFigure :label="t('admin.dashboard.sample.rate', { n: num(2) })" :value="90" :previous="95.5" :empty="''" />
    </dl>
    <dl v-else class="m-0 grid gap-3">
      <ValueDeltaFigure :label="t('admin.dashboard.sample.figure')" :value="24" :previous="26" />
      <ValueDeltaFigure :label="t('admin.dashboard.sample.figure')" :value="18" :previous="12" />
    </dl>
  </div>
</template>
