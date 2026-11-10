<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminCan } from "~/composables/admin/useAdminCan";
import { useAdminAuditEvent } from "~/composables/admin/useAdminAuditLog";
import { auditGroupOf } from "~~/shared/constants/audit-actions";
import type { AdminAuditListItem } from "~~/shared/schemas/admin-audit-log";
import { changeRows, type ChangeRow } from "~~/shared/utils/audit-changes";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";
import { localizedPath } from "~~/shared/utils/locale-path";

// The body of an open Details panel (.specs/audit-log/spec.md "Details panel"): up to five change rows with a
// "Show all N changes" button, then the raw key, group, entity and request ID. It fetches the event the first
// time it is shown; the page keeps the answer. All values are plain text.
const props = defineProps<{ id: string; open: boolean; firstOpened: boolean; link?: AdminAuditListItem["link"] }>();
const { t, te, locale } = useI18n();
const can = useAdminCan();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const query = useAdminAuditEvent(toRef(props, "id"), toRef(props, "firstOpened"));
const event = computed(() => query.data.value);

const FIRST_ROWS = 5;
const showAll = ref(false);
// Closing the card resets it to five rows.
watch(
  () => props.open,
  (open) => {
    if (!open) showAll.value = false;
  },
);

const rows = computed(() => changeRows(event.value?.summary));
const shown = computed(() => (showAll.value ? rows.value : rows.value.slice(0, FIRST_ROWS)));
const count = (n: number) => toLocaleDigits(String(n), digits.value);

const humanise = (key: string) => {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
const fieldName = (row: ChangeRow) => {
  const path = `admin.auditLog.fields.${row.field}`;
  const base = te(path) ? t(path) : humanise(row.field);
  return "key" in row && row.key !== undefined ? `${base} · ${row.key}` : base;
};
function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return t("admin.auditLog.details.empty");
  if (typeof value === "boolean") return t(value ? "admin.auditLog.details.yes" : "admin.auditLog.details.no");
  if (typeof value === "number") return toLocaleDigits(String(value), digits.value);
  // A status value has a label of its own.
  if (field === "status" && te(`admin.users.statuses.${String(value)}`)) return t(`admin.users.statuses.${String(value)}`);
  return String(value);
}
const rowText = (row: ChangeRow) => {
  if (row.kind === "change") return t("admin.auditLog.details.from", { field: fieldName(row), from: formatValue(row.field, row.from), to: formatValue(row.field, row.to) });
  if (row.kind === "value") return t("admin.auditLog.details.value", { field: fieldName(row), value: formatValue(row.field, row.value) });
  return t(`admin.auditLog.details.${row.kind}`, { field: fieldName(row), value: formatValue(row.field, row.value) });
};
// The Open link shows only when the viewer holds the page's Permission (the server already dropped it for a deleted record).
const openLink = computed(() => (props.link && can(props.link.permission) ? { label: t(`admin.auditLog.details.open.${props.link.kind}`), to: localizedPath(props.link.path, digits.value) } : null));
const group = computed(() => {
  const resolved = event.value ? auditGroupOf(event.value.action) : null;
  return resolved ? t(`admin.auditLog.groups.${resolved}`) : t("admin.auditLog.groups.other");
});
</script>

<template>
  <div v-if="query.isError.value && !event" class="grid justify-items-start gap-2 text-sm" role="alert" data-slot="details-error">
    <p>{{ t("admin.auditLog.details.error") }}</p>
    <Button type="button" variant="outline" size="sm" @click="query.refetch()">{{ t("admin.auditLog.details.retry") }}</Button>
  </div>
  <div v-else-if="!event" class="grid gap-2" data-slot="details-loading" role="status" :aria-label="t('admin.auditLog.details.loading')">
    <Skeleton v-for="n in 3" :key="n" class="h-4 w-full" />
  </div>
  <div v-else class="grid gap-3 text-sm" data-slot="details-content">
    <p v-if="!rows.length" class="text-muted-foreground" data-slot="details-none">{{ t("admin.auditLog.details.none") }}</p>
    <ul v-else class="grid max-h-80 gap-1 overflow-y-auto" data-slot="details-rows">
      <li v-for="(row, index) in shown" :key="index" class="break-words" data-slot="details-row"><bdi>{{ rowText(row) }}</bdi></li>
    </ul>
    <Button v-if="rows.length > FIRST_ROWS && !showAll" type="button" variant="outline" size="sm" class="justify-self-start" data-slot="show-all" @click="showAll = true">
      {{ t("admin.auditLog.details.showAll", { count: count(rows.length) }) }}
    </Button>
    <dl class="text-muted-foreground grid gap-1 text-xs">
      <div class="flex flex-wrap gap-x-2">
        <dt>{{ t("admin.auditLog.details.key") }}</dt>
        <dd><bdi class="font-mono" dir="ltr" data-slot="detail-key">{{ event.action }}</bdi></dd>
      </div>
      <div class="flex flex-wrap gap-x-2">
        <dt>{{ t("admin.auditLog.details.group") }}</dt>
        <dd data-slot="detail-group">{{ group }}</dd>
      </div>
      <div class="flex flex-wrap gap-x-2">
        <dt>{{ t("admin.auditLog.details.entity") }}</dt>
        <dd><bdi class="font-mono" dir="ltr" data-slot="detail-entity">{{ event.entityType }}/{{ event.entityId ?? t("admin.auditLog.details.noId") }}</bdi></dd>
      </div>
      <div class="flex flex-wrap gap-x-2">
        <dt>{{ t("admin.auditLog.details.requestId") }}</dt>
        <dd data-slot="detail-request">
          <bdi v-if="event.correlationId" class="font-mono" dir="ltr">{{ event.correlationId }}</bdi>
          <template v-else>{{ t("admin.auditLog.details.noRequestId") }}</template>
        </dd>
      </div>
    </dl>
    <NuxtLink v-if="openLink" :to="openLink.to" class="w-fit text-sm font-medium underline underline-offset-4" data-slot="open-link">{{ openLink.label }}</NuxtLink>
  </div>
</template>
