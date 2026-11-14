<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import AdminDayInput from "~/components/admin/AdminDayInput.vue";
import AdminSearchInput from "~/components/admin/AdminSearchInput.vue";
import { ADMIN_NAV_ICONS } from "~/components/admin/admin-nav-icons";
import AdminAuditEventCard from "~/components/admin/AdminAuditEventCard.vue";
import { useAdminAuditActors, useAdminAuditLog } from "~/composables/admin/useAdminAuditLog";
import { AUDIT_GROUPS, type AuditGroup } from "~~/shared/constants/audit-actions";
import { auditActorName, groupAuditByDay } from "~~/shared/utils/audit-feed";
import { AUDIT_URL_KEYS, buildAuditListUrlQuery, hasAuditFilters, parseAuditListUrl, type AuditListState } from "~~/shared/utils/audit-list-url";
import { formatDate } from "~~/shared/utils/format-date";

// Audit log (.specs/audit-log/spec.md): the read-only, newest-first feed of audit events under day headings, 20 per
// page with Previous and Next, narrowed by a search box (an exact entity id or request id), an Action group, an Actor
// and a From/To day range. Every piece of state is in the URL and written with `replace`; a filter change drops the
// cursor, and an invalid value is dropped and the address cleaned.
definePageMeta({ permission: "view-audit-log" });

const { t, locale } = useI18n();
useHead({ title: () => t("admin.nav.items.auditLog") });
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const route = useRoute();
const router = useRouter();
const state = computed(() => parseAuditListUrl(route.query));
const hasFilters = computed(() => hasAuditFilters(state.value));
const query = useAdminAuditLog(state);
const page = computed(() => query.data.value);
const days = computed(() => groupAuditByDay(page.value?.items ?? []));
const loading = computed(() => query.isFetching.value);

// Our own keys are rewritten from the parsed state; any other key in the address is kept as it is.
const replaceState = (next: AuditListState) => {
  const others = Object.fromEntries(Object.entries(route.query).filter(([key]) => !(AUDIT_URL_KEYS as readonly string[]).includes(key)));
  return router.replace({ query: { ...others, ...buildAuditListUrlQuery(next) } });
};
/** A change of search or filter starts from the newest events. */
const setFilter = (next: Partial<AuditListState>) => replaceState({ ...state.value, cursor: undefined, ...next });
const clearFilters = () => replaceState({});

// An address with an invalid value (or a cursor that leads nowhere) is cleaned.
watch(
  () => [route.query, page.value, query.isPlaceholderData.value] as const,
  ([raw, data, placeholder]) => {
    const wanted = buildAuditListUrlQuery(state.value);
    const dead = data && !placeholder && state.value.cursor && data.previousCursor === null;
    const dirty = AUDIT_URL_KEYS.some((key) => (typeof raw[key] === "string" ? (raw[key] as string) : undefined) !== wanted[key]) || Boolean(dead);
    if (dirty) replaceState(dead ? { ...state.value, cursor: undefined } : state.value);
  },
  { immediate: true },
);

const searchText = ref(state.value.q ?? "");
watch(
  () => state.value.q,
  (value) => (searchText.value = value ?? ""),
);
const applySearch = useDebounceFn((value: string) => setFilter({ q: value.trim() || undefined }), 300);
watch(searchText, (value) => {
  if (value.trim() !== (state.value.q ?? "")) applySearch(value);
});

const ANY = "any";
const actors = useAdminAuditActors();
const actorLabel = (actor: { givenName: string | null; familyName: string | null; phoneE164: string }) => {
  const shown = auditActorName({ id: "", ...actor });
  return shown.kind === "system" ? "" : shown.text;
};

const heading = ref<HTMLElement | null>(null);
const pendingFocus = ref(false);
async function go(next: string | null | undefined) {
  if (!next || loading.value) return;
  pendingFocus.value = true;
  await replaceState({ ...state.value, cursor: next });
}
// Once the new page is in, scroll to the feed top and move focus to the feed heading.
watch(
  () => [page.value, query.isFetching.value] as const,
  async ([, fetching]) => {
    if (!pendingFocus.value || fetching) return;
    pendingFocus.value = false;
    await nextTick();
    heading.value?.scrollIntoView({ block: "start" });
    heading.value?.focus({ preventScroll: true });
  },
);
</script>

<template>
  <AdminPageHeader :title="t('admin.nav.items.auditLog')" :icon="ADMIN_NAV_ICONS['audit-log']">
    <div class="mx-auto grid w-full max-w-3xl gap-4" :aria-busy="loading">
      <div class="flex w-full flex-wrap items-center gap-2" role="search" data-slot="audit-filters">
        <AdminSearchInput v-model="searchText" class="max-w-xs min-w-48 flex-1" :aria-label="t('admin.auditLog.filters.searchLabel')" :placeholder="t('admin.auditLog.filters.searchPlaceholder')" />
        <Select :model-value="state.group ?? ANY" @update:model-value="(value) => setFilter({ group: value === ANY ? undefined : (String(value) as AuditGroup) })">
          <SelectTrigger class="w-44" :aria-label="t('admin.auditLog.filters.groupLabel')" data-slot="audit-group"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ANY">{{ t("admin.auditLog.filters.allGroups") }}</SelectItem>
            <SelectItem v-for="group in AUDIT_GROUPS" :key="group" :value="group">{{ t(`admin.auditLog.groups.${group}`) }}</SelectItem>
          </SelectContent>
        </Select>
        <Select :model-value="state.actor ?? ANY" @update:model-value="(value) => setFilter({ actor: value === ANY ? undefined : String(value) })">
          <SelectTrigger class="w-48" :aria-label="t('admin.auditLog.filters.actorLabel')" data-slot="audit-actor"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ANY">{{ t("admin.auditLog.filters.allActors") }}</SelectItem>
            <SelectItem value="system">{{ t("admin.auditLog.actor.system") }}</SelectItem>
            <SelectItem v-for="actor in actors.data.value?.items ?? []" :key="actor.id" :value="actor.id"><bdi>{{ actorLabel(actor) }}</bdi></SelectItem>
          </SelectContent>
        </Select>
        <div role="group" :aria-label="t('admin.auditLog.filters.from') + ' – ' + t('admin.auditLog.filters.to')" class="flex flex-wrap items-center gap-1">
          <AdminDayInput :model-value="state.from" :label="t('admin.auditLog.filters.from')" :placeholder="t('admin.auditLog.filters.from')" :clear-label="t('admin.auditLog.filters.clearFrom')" @update:model-value="(value) => setFilter({ from: value || undefined })" />
          <AdminDayInput :model-value="state.to" :label="t('admin.auditLog.filters.to')" :placeholder="t('admin.auditLog.filters.to')" :clear-label="t('admin.auditLog.filters.clearTo')" @update:model-value="(value) => setFilter({ to: value || undefined })" />
        </div>
        <Button v-if="hasFilters" type="button" variant="ghost" data-slot="audit-clear" @click="clearFilters">{{ t("admin.auditLog.filters.clearFilters") }}</Button>
      </div>
      <h2 ref="heading" tabindex="-1" class="sr-only" data-slot="audit-feed-heading">{{ t("admin.auditLog.feedLabel") }}</h2>
      <div v-if="query.isError.value && !page" class="grid justify-items-start gap-2 rounded-lg border p-4 text-sm" role="alert">
        <p>{{ t("admin.auditLog.loadError") }}</p>
        <Button type="button" variant="outline" size="sm" @click="query.refetch()">{{ t("admin.auditLog.retry") }}</Button>
      </div>
      <ul v-else-if="!page" class="grid gap-3" data-slot="audit-skeleton">
        <li v-for="n in 5" :key="n" class="grid gap-2 rounded-lg border p-3"><Skeleton class="h-4 w-3/4" /><Skeleton class="h-3 w-1/3" /></li>
      </ul>
      <div v-else-if="!days.length" class="grid justify-items-start gap-2" :class="loading ? 'opacity-60' : undefined" data-slot="audit-empty">
        <p class="text-muted-foreground text-sm">{{ hasFilters ? t("admin.auditLog.filters.noMatch") : t("admin.auditLog.empty") }}</p>
        <Button v-if="hasFilters" type="button" variant="outline" size="sm" @click="clearFilters">{{ t("admin.auditLog.filters.clearFilters") }}</Button>
      </div>
      <template v-else>
        <section v-for="day in days" :key="day.day" class="grid gap-2" data-slot="audit-day">
          <h3 class="text-muted-foreground text-sm font-medium">{{ formatDate(day.at, digits) }}</h3>
          <ol class="grid gap-2 border-s" :aria-label="t('admin.auditLog.feedLabel')">
            <AdminAuditEventCard v-for="item in day.items" :key="item.id" :event="item" />
          </ol>
        </section>
        <nav class="flex items-center justify-between gap-2" :aria-label="t('admin.auditLog.navLabel')" data-slot="audit-pager">
          <Button type="button" variant="outline" size="sm" data-slot="audit-previous" :disabled="!page.previousCursor || loading" @click="go(page.previousCursor)">{{ t("admin.auditLog.previous") }}</Button>
          <Button type="button" variant="outline" size="sm" data-slot="audit-next" :disabled="!page.nextCursor || loading" @click="go(page.nextCursor)">{{ t("admin.auditLog.next") }}</Button>
        </nav>
      </template>
    </div>
  </AdminPageHeader>
</template>
