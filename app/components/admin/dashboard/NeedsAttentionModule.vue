<script setup lang="ts">
import { IconBellRinging } from "@tabler/icons-vue";
import { useNeedsAttention } from "~/composables/admin/useAdminDashboard";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { ADMIN_NAV } from "~~/shared/constants/admin-nav";
import { NEEDS_ATTENTION_KEY } from "~~/shared/constants/dashboard-modules";
import { formatNavCount } from "~~/shared/schemas/admin-nav-counts";
import DashboardModuleCard from "./DashboardModuleCard.vue";

// Needs attention (admin-dashboard spec "Needs attention"): the queues waiting now, one row per queue the User may open.
// A row is a nav item with a `countKey`; its count is the menu badge's own count, and it links to that page. A row with
// nothing waiting is muted and has no link; when every row is zero "All caught up" shows above them. The grid hides the
// whole module when no row is visible.
defineProps<{ index?: number }>();

const { t, num, locale, localePath } = useAdminFormat();
const lang = computed(() => (locale.value === "en" ? "en" : "fa"));
const query = useNeedsAttention();
const rows = computed(() =>
  (query.data.value?.rows ?? []).flatMap((row) => {
    const item = ADMIN_NAV.find((entry) => entry.countKey === row.key);
    return item ? [{ key: row.key, count: row.count, path: item.path, label: t(`admin.dashboard.needsAttention.rows.${row.key}`) }] : [];
  }),
);
const status = computed<"loading" | "error" | "ready">(() => (query.isError.value ? "error" : query.data.value ? "ready" : "loading"));
const caughtUp = computed(() => rows.value.length > 0 && rows.value.every((row) => row.count === 0));
const shownCount = (count: number) => formatNavCount(count, lang.value) ?? num(0);
</script>

<template>
  <DashboardModuleCard
    v-if="status !== 'ready' || rows.length > 0"
    :module-key="NEEDS_ATTENTION_KEY"
    :title="t('admin.dashboard.modules.needsAttention')"
    :icon="IconBellRinging"
    :status="status"
    :updated-at="query.dataUpdatedAt.value || undefined"
    :refreshing="query.isFetching.value"
    :index="index"
    @refresh="query.refetch()"
  >
    <p v-if="caughtUp" data-slot="needs-attention-caught-up" class="mb-3 text-sm font-medium">{{ t("admin.dashboard.needsAttention.caughtUp") }}</p>
    <ul data-slot="needs-attention-rows" class="m-0 grid list-none gap-1 p-0">
      <li v-for="row in rows" :key="row.key" data-slot="needs-attention-row" :data-row="row.key" :data-zero="row.count === 0 || undefined">
        <NuxtLink
          v-if="row.count > 0"
          :to="localePath(row.path)"
          class="hover:bg-accent focus-visible:ring-ring/50 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-3"
        >
          <span>{{ row.label }}</span>
          <span data-slot="needs-attention-count" class="font-semibold tabular-nums">{{ shownCount(row.count) }}</span>
        </NuxtLink>
        <div v-else class="text-muted-foreground flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
          <span>{{ row.label }}</span>
          <span data-slot="needs-attention-count" class="tabular-nums">{{ shownCount(0) }}</span>
        </div>
      </li>
    </ul>
  </DashboardModuleCard>
</template>
