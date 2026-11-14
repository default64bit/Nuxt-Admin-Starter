<script setup lang="ts">
import { IconAdjustmentsHorizontal } from "@tabler/icons-vue";
import { onBeforeRouteLeave } from "vue-router";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_NAV_ICONS } from "~/components/admin/admin-nav-icons";
import ChartStyleMenu from "~/components/admin/dashboard/ChartStyleMenu.vue";
import DashboardChooseModules from "~/components/admin/dashboard/DashboardChooseModules.vue";
import DashboardEditBar from "~/components/admin/dashboard/DashboardEditBar.vue";
import DashboardGrid from "~/components/admin/dashboard/DashboardGrid.vue";
import { useAdminDashboardPreferences, useNeedsAttention } from "~/composables/admin/useAdminDashboard";
import { useDashboardCustomize } from "~/composables/admin/useDashboardCustomize";
import { NEEDS_ATTENTION_KEY } from "~~/shared/constants/dashboard-modules";

// The Dashboard (.specs/admin-dashboard/spec.md): every User sees their layout (the default until they save one) filtered
// by what their Roles may see, or a clear message when nothing is left. The page needs no permission; the server filters every module again.
// Customize mode arranges a draft (move, resize, Fill, remove, reset) that only Save writes; a refetch never replaces it.
const { t } = useI18n();
useHead({ title: () => t("admin.dashboard.title") });
const query = useAdminDashboardPreferences();
const saved = computed(() => query.data.value?.modules ?? []);
const customize = useDashboardCustomize();
const shown = computed(() => customize.draft.value ?? saved.value);
const choosing = ref(false);
const chosen = computed(() => (customize.draft.value ?? []).map((entry) => entry.key));
// Needs attention hides itself when no row is visible, so a User left with only that module has an empty Dashboard.
const attention = useNeedsAttention();
const attentionEmpty = computed(() => attention.data.value?.rows.length === 0);
const onlyAttention = computed(() => saved.value.length > 0 && saved.value.every((entry) => entry.key === NEEDS_ATTENTION_KEY));
const waiting = computed(() => onlyAttention.value && attention.isPending.value);
const hasModules = computed(() => saved.value.some((entry) => entry.key !== NEEDS_ATTENTION_KEY || !attentionEmpty.value));

// A move keeps focus on the module's Move button (the list is reordered under it).
async function move(key: string, direction: Parameters<typeof customize.move>[1]) {
  if (!customize.move(key, direction)) return;
  await nextTick();
  document.querySelector<HTMLElement>(`[data-slot="dashboard-grid"] > [data-module="${key}"] [data-slot="dashboard-move-trigger"]`)?.focus();
}

async function reorder(key: string, targetKey: string, placement: Parameters<typeof customize.moveTo>[2]) {
  if (!customize.moveTo(key, targetKey, placement)) return;
  await nextTick();
  document.querySelector<HTMLElement>(`[data-slot="dashboard-grid"] > [data-module="${key}"] [data-slot="dashboard-grip"]`)?.focus();
}

// Leaving with an unsaved draft asks first: in the app (a route change) and in the browser (a reload or closing the tab).
// Escape or a click outside closes the dialog without a choice: that is Keep editing. A button's own click is handled first.
const leaving = ref(false);
let answer: ((leave: boolean) => void) | null = null;
const settle = (leave: boolean) => {
  leaving.value = false;
  answer?.(leave);
  answer = null;
};
onBeforeRouteLeave(() => {
  if (!customize.dirty.value) return true;
  leaving.value = true;
  return new Promise<boolean>((resolve) => (answer = resolve));
});
const warn = (event: BeforeUnloadEvent) => {
  if (customize.dirty.value) event.preventDefault();
};
onMounted(() => window.addEventListener("beforeunload", warn));
onBeforeUnmount(() => window.removeEventListener("beforeunload", warn));
</script>

<template>
  <AdminPageHeader :title="t('admin.dashboard.title')" :icon="ADMIN_NAV_ICONS.dashboard">
    <template v-if="query.data.value && hasModules" #actions>
      <ChartStyleMenu :model-value="query.data.value.chartStyle" />
      <Button v-if="!customize.customizing.value" type="button" variant="outline" size="sm" data-slot="dashboard-customize" @click="customize.start()">
        <IconAdjustmentsHorizontal class="size-4" aria-hidden="true" />
        {{ t("admin.dashboard.customize.button") }}
      </Button>
    </template>
    <div v-if="query.isError.value" role="alert" data-slot="dashboard-error" class="flex flex-col items-start gap-3">
      <p class="text-muted-foreground text-sm">{{ t("admin.dashboard.loadFailed") }}</p>
      <Button type="button" variant="outline" size="sm" @click="query.refetch()">{{ t("admin.dashboard.retry") }}</Button>
    </div>
    <div v-else-if="!query.data.value || waiting" data-slot="dashboard-loading" class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
      <Skeleton v-for="n in 3" :key="n" class="h-48 md:col-span-1 lg:col-span-2" />
    </div>
    <p v-else-if="!hasModules" data-slot="dashboard-no-modules" class="text-muted-foreground text-sm">{{ t("admin.dashboard.empty") }}</p>
    <template v-else>
      <DashboardEditBar
        v-if="customize.customizing.value"
        :saving="customize.saving.value"
        :save-error="customize.saveError.value"
        :stale="customize.stale.value"
        @choose="choosing = true"
        @reset="customize.reset()"
        @cancel="customize.cancel()"
        @save="customize.save()"
        @load-latest="customize.loadLatest()"
      />
      <DashboardGrid
        :modules="shown"
        :editing="customize.customizing.value"
        @move="move"
        @reorder="reorder"
        @resize="customize.resize"
        @fill="customize.setFill"
        @remove="customize.remove"
      />
      <DashboardChooseModules v-model:open="choosing" :available="query.data.value.pickerModules" :chosen="chosen" @add="customize.add" @remove="customize.remove" />
      <p class="sr-only" role="status" aria-live="polite" data-slot="dashboard-announcement">{{ customize.announcement.value }}</p>
    </template>

    <AlertDialog :open="leaving" @update:open="(open) => !open && nextTick(() => leaving && settle(false))">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("admin.dashboard.customize.leaveTitle") }}</AlertDialogTitle>
          <AlertDialogDescription>{{ t("admin.dashboard.customize.leaveBody") }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-slot="dashboard-leave-stay" @click="settle(false)">{{ t("admin.dashboard.customize.leaveStay") }}</AlertDialogCancel>
          <AlertDialogAction data-slot="dashboard-leave-confirm" @click="settle(true)">{{ t("admin.dashboard.customize.leaveConfirm") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </AdminPageHeader>
</template>
