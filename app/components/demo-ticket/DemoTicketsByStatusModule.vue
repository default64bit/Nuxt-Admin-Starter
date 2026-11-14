<!-- demo-ticket:start (whole file) -->
<script setup lang="ts">
import { IconTicket } from "@tabler/icons-vue";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardModuleCard from "~/components/admin/dashboard/DashboardModuleCard.vue";
import MicroBar from "~/components/admin/dashboard/MicroBar.vue";
import { useDashboardModule } from "~/composables/admin/useAdminDashboard";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useChartStyle } from "~/composables/admin/useChartStyle";
import type { ModuleRangeKey } from "~~/shared/constants/analytics";
import { DEMO_TICKETS_BY_STATUS_KEY, moduleTitleKey } from "~~/shared/constants/dashboard-modules";
import DemoTicketStatusBadge from "./DemoTicketStatusBadge.vue";

// Demo tickets by status: the pipeline now, one row per status in order, each opening the list on that status. The
// counts are live (they take no range). In Pro a micro bar sits under each row.
defineProps<{ index?: number }>();

const { t, num, localePath } = useAdminFormat();
const style = useChartStyle();
const noRange = ref<ModuleRangeKey>("last-30-days");
const query = useDashboardModule(DEMO_TICKETS_BY_STATUS_KEY, noRange, 0);
const title = computed(() => t(moduleTitleKey(DEMO_TICKETS_BY_STATUS_KEY)));
const status = computed<"loading" | "error" | "ready">(() => (query.isError.value ? "error" : query.data.value ? "ready" : "loading"));
const max = computed(() => Math.max(1, ...(query.data.value?.statuses.map((entry) => entry.count) ?? [])));
</script>

<template>
  <DashboardModuleCard
    :module-key="DEMO_TICKETS_BY_STATUS_KEY"
    :title="title"
    :icon="IconTicket"
    :status="status"
    :updated-at="query.dataUpdatedAt.value || undefined"
    :refreshing="query.isFetching.value"
    :index="index"
    @refresh="query.refetch()"
  >
    <template #skeleton>
      <Skeleton v-for="n in 4" :key="n" class="h-5 w-full" />
    </template>
    <ul v-if="query.data.value" data-slot="demo-ticket-status-rows" class="m-0 grid list-none gap-1 p-0">
      <li v-for="entry in query.data.value.statuses" :key="entry.status" data-slot="demo-ticket-status-row" :data-status="entry.status" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <NuxtLink
          :to="{ path: localePath('/admin/demo-tickets'), query: { status: entry.status } }"
          class="hover:bg-accent focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-2 py-1 outline-none focus-visible:ring-3"
        >
          <DemoTicketStatusBadge :status="entry.status" />
          <span class="font-semibold tabular-nums">{{ num(entry.count) }}</span>
        </NuxtLink>
        <MicroBar v-if="style === 'pro'" :value="entry.count" :max="max" class="basis-full" />
      </li>
    </ul>
    <template #footer-link>
      <NuxtLink :to="localePath('/admin/demo-tickets')" data-slot="demo-ticket-status-link" class="hover:text-foreground underline-offset-4 hover:underline">{{ t("admin.dashboard.demoTickets.openTickets") }}</NuxtLink>
    </template>
  </DashboardModuleCard>
</template>
<!-- demo-ticket:end -->
