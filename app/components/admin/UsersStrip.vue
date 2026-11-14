<script setup lang="ts">
import AdminAnalyticsStrip from "~/components/admin/AdminAnalyticsStrip.vue";
import Sparkline from "~/components/admin/dashboard/Sparkline.vue";
import ValueDeltaFigure from "~/components/admin/dashboard/ValueDeltaFigure.vue";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useUsersStrip } from "~/composables/admin/useAdminStrip";

// The Users strip (.specs/users-and-roles/spec.md "Users list"): accounts created in the last 30 days with their
// change and a daily sparkline, every account now, and how many are disabled.
const { t, num } = useAdminFormat();
const query = useUsersStrip();
const status = computed<"loading" | "error" | "ready">(() => (query.isError.value && !query.data.value ? "error" : query.data.value ? "ready" : "loading"));
const counts = computed(() => query.data.value?.sparkline.map((entry) => entry.count) ?? []);
const spoken = computed(() => t("admin.strip.users.sparkline", { days: num(counts.value.length), total: num(query.data.value?.newAccounts.current ?? 0) }));
</script>

<template>
  <AdminAnalyticsStrip name="users" :label="t('admin.strip.users.label')" :status="status" @retry="query.refetch()">
    <div v-if="query.data.value" class="grid gap-4 sm:grid-cols-3">
      <div class="flex flex-col gap-2">
        <dl class="m-0"><ValueDeltaFigure :label="t('admin.strip.users.newAccounts')" :value="query.data.value.newAccounts.current" :previous="query.data.value.newAccounts.previous" /></dl>
        <Sparkline :counts="counts" :label="spoken" />
      </div>
      <dl class="m-0 flex flex-col gap-0.5">
        <dt class="text-muted-foreground text-xs">{{ t("admin.strip.users.total") }}</dt>
        <dd data-slot="strip-total" class="m-0 text-xl font-semibold tabular-nums">{{ num(query.data.value.total) }}</dd>
      </dl>
      <dl class="m-0 flex flex-col gap-0.5">
        <dt class="text-muted-foreground text-xs">{{ t("admin.strip.users.disabled") }}</dt>
        <dd data-slot="strip-disabled" class="m-0 text-xl font-semibold tabular-nums">{{ num(query.data.value.disabled) }}</dd>
      </dl>
    </div>
  </AdminAnalyticsStrip>
</template>
