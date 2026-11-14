<script setup lang="ts">
import { IconUserPlus } from "@tabler/icons-vue";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminDashboardPreferences, useDashboardModule, useSaveModuleRange } from "~/composables/admin/useAdminDashboard";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { dashboardModule, moduleTitleKey, NEW_ACCOUNTS_KEY } from "~~/shared/constants/dashboard-modules";
import type { ModuleRangeKey } from "~~/shared/constants/analytics";
import DashboardModuleCard from "./DashboardModuleCard.vue";
import DashboardRangeMenu from "./DashboardRangeMenu.vue";
import Sparkline from "./Sparkline.vue";
import ValueDeltaFigure from "./ValueDeltaFigure.vue";

// New accounts: accounts created in the range with their change, a daily sparkline (at least 7 days ending with the
// range) and the total number of accounts now, with a footer link to the Users list.
defineProps<{ index?: number }>();

const { t, num, localePath } = useAdminFormat();
const definition = dashboardModule(NEW_ACCOUNTS_KEY)!;
const preferences = useAdminDashboardPreferences();
const range = computed<ModuleRangeKey>(() => preferences.data.value?.ranges[NEW_ACCOUNTS_KEY] ?? definition.defaultRange!);
const query = useDashboardModule(NEW_ACCOUNTS_KEY, range, 0); // its total is live
const save = useSaveModuleRange();
const title = computed(() => t(moduleTitleKey(NEW_ACCOUNTS_KEY)));
const status = computed<"loading" | "error" | "ready">(() => (query.isError.value ? "error" : query.data.value ? "ready" : "loading"));
const choose = (next: ModuleRangeKey) => save.mutate({ moduleKey: NEW_ACCOUNTS_KEY, range: next });
const counts = computed(() => query.data.value?.sparkline.map((entry) => entry.count) ?? []);
const spoken = computed(() => t("admin.dashboard.newAccounts.sparkline", { days: num(counts.value.length), total: num(counts.value.reduce((sum, n) => sum + n, 0)) }));
</script>

<template>
  <DashboardModuleCard
    :module-key="NEW_ACCOUNTS_KEY"
    :title="title"
    :icon="IconUserPlus"
    :status="status"
    :updated-at="query.dataUpdatedAt.value || undefined"
    :refreshing="query.isFetching.value"
    :index="index"
    @refresh="query.refetch()"
  >
    <template #header-actions>
      <DashboardRangeMenu :ranges="definition.ranges" :model-value="range" :module-title="title" @update:model-value="choose" />
    </template>
    <template #skeleton>
      <Skeleton class="h-6 w-full" />
      <Skeleton class="h-10 w-full" />
      <Skeleton class="h-4 w-1/2" />
    </template>
    <div v-if="query.data.value" :key="range" class="grid gap-3">
      <dl class="m-0 grid gap-4">
        <ValueDeltaFigure :label="t('admin.dashboard.newAccounts.newAccounts')" :value="query.data.value.newAccounts.current" :previous="query.data.value.newAccounts.previous" />
      </dl>
      <Sparkline :counts="counts" :label="spoken" />
      <p data-slot="new-accounts-total" class="m-0 flex items-baseline justify-between gap-3 border-t pt-3 text-sm">
        <span class="text-muted-foreground">{{ t("admin.dashboard.newAccounts.total") }}</span>
        <span class="font-semibold tabular-nums">{{ num(query.data.value.totalAccounts) }}</span>
      </p>
    </div>
    <template #footer-link>
      <NuxtLink :to="localePath('/admin/users')" data-slot="new-accounts-link" class="hover:text-foreground underline-offset-4 hover:underline">{{ t("admin.dashboard.newAccounts.openUsers") }}</NuxtLink>
    </template>
  </DashboardModuleCard>
</template>
