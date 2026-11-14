<!-- demo-ticket:start (whole file) -->
<script setup lang="ts">
import { IconChartBar, IconTable } from "@tabler/icons-vue";
import { useIntersectionObserver } from "@vueuse/core";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardModuleCard from "~/components/admin/dashboard/DashboardModuleCard.vue";
import DashboardRangeMenu from "~/components/admin/dashboard/DashboardRangeMenu.vue";
import { useAdminDashboardPreferences, useDashboardModule, useSaveModuleRange } from "~/composables/admin/useAdminDashboard";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import type { ModuleRangeKey } from "~~/shared/constants/analytics";
import { DEMO_TICKETS_PER_DAY_KEY, dashboardModule, moduleTitleKey } from "~~/shared/constants/dashboard-modules";
import { dayPeriod } from "~~/shared/utils/chart-format";

// Demo tickets created per day: a bar chart of the range's days in the admin's Chart style. The chart is its own lazy
// chunk (chart.js + vue-chartjs), created only once this module scrolls into view after hydration and never during
// server rendering; "View as table" shows the same data without it.
defineProps<{ index?: number }>();

const AsyncChart = defineAsyncComponent(() => import("./DemoTicketTrendChart.vue"));
const { t, num, localePath, locale } = useAdminFormat();
const lang = computed<"fa" | "en">(() => (locale.value === "en" ? "en" : "fa"));
const definition = dashboardModule(DEMO_TICKETS_PER_DAY_KEY)!;
const preferences = useAdminDashboardPreferences();
const range = computed<ModuleRangeKey>(() => preferences.data.value?.ranges[DEMO_TICKETS_PER_DAY_KEY] ?? definition.defaultRange!);
const query = useDashboardModule(DEMO_TICKETS_PER_DAY_KEY, range);
const save = useSaveModuleRange();
const title = computed(() => t(moduleTitleKey(DEMO_TICKETS_PER_DAY_KEY)));
const status = computed<"loading" | "error" | "ready">(() => (query.isError.value ? "error" : query.data.value ? "ready" : "loading"));
const choose = (next: ModuleRangeKey) => save.mutate({ moduleKey: DEMO_TICKETS_PER_DAY_KEY, range: next });
const seriesLabel = computed(() => t("admin.dashboard.demoTickets.created"));
const summary = computed(() => t("admin.dashboard.demoTickets.perDaySummary", { days: num(query.data.value?.days.length ?? 0), total: num(query.data.value?.total ?? 0) }));

// Created when scrolled into view, after hydration (the observer starts on mount, so never during server rendering).
const host = ref<HTMLElement | null>(null);
const seen = ref(false);
const { stop } = useIntersectionObserver(host, ([entry]) => {
  if (entry?.isIntersecting) {
    seen.value = true;
    stop();
  }
});
const showTable = ref(false);
</script>

<template>
  <DashboardModuleCard
    :module-key="DEMO_TICKETS_PER_DAY_KEY"
    :title="title"
    :icon="IconChartBar"
    :status="status"
    :updated-at="query.dataUpdatedAt.value || undefined"
    :refreshing="query.isFetching.value"
    :index="index"
    @refresh="query.refetch()"
  >
    <template #header-actions>
      <Button type="button" variant="outline" size="sm" data-slot="demo-ticket-trend-toggle" :aria-pressed="showTable" @click="showTable = !showTable">
        <component :is="showTable ? IconChartBar : IconTable" class="size-4" aria-hidden="true" />
        {{ showTable ? t("admin.dashboard.demoTickets.viewAsChart") : t("admin.dashboard.demoTickets.viewAsTable") }}
      </Button>
      <DashboardRangeMenu :ranges="definition.ranges" :model-value="range" :module-title="title" @update:model-value="choose" />
    </template>
    <template #skeleton>
      <Skeleton class="h-56 w-full sm:h-64" />
    </template>
    <div v-if="query.data.value" ref="host" class="flex flex-col gap-2">
      <div v-if="showTable" class="max-h-64 overflow-auto">
        <table data-slot="demo-ticket-trend-table" class="w-full text-sm">
          <caption class="sr-only">{{ summary }}</caption>
          <thead>
            <tr class="text-muted-foreground text-xs">
              <th scope="col" class="py-1 text-start font-medium">{{ t("admin.dashboard.demoTickets.day") }}</th>
              <th scope="col" class="py-1 text-end font-medium">{{ seriesLabel }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in query.data.value.days" :key="entry.day" class="border-t">
              <th scope="row" class="py-1 text-start font-normal">{{ dayPeriod(entry.day, lang) }}</th>
              <td class="py-1 text-end tabular-nums">{{ num(entry.count) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <template v-else>
        <div v-if="!seen" data-slot="demo-ticket-trend-placeholder" class="bg-muted/40 h-56 w-full rounded-md sm:h-64" />
        <AsyncChart v-else :key="range" :days="query.data.value.days" :summary="summary" :series-label="seriesLabel" />
      </template>
    </div>
    <template #footer-link>
      <NuxtLink :to="localePath('/admin/demo-tickets')" data-slot="demo-ticket-trend-link" class="hover:text-foreground underline-offset-4 hover:underline">{{ t("admin.dashboard.demoTickets.openTickets") }}</NuxtLink>
    </template>
  </DashboardModuleCard>
</template>
<!-- demo-ticket:end -->
