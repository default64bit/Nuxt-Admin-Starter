<script setup lang="ts">
import { IconBell } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminInboxItem from "~/components/admin/AdminInboxItem.vue";
import { useAdminBreadcrumbs } from "~/composables/admin/useAdminBreadcrumbs";
import { useAdminInboxList, useInboxMutations } from "~/composables/admin/useAdminInbox";
import { visibleAttentionTypes, type AttentionType } from "~~/shared/constants/notification-catalog";
import { ADMIN_PAGE_SIZE } from "~~/shared/schemas/admin-list";
import { attentionTitle } from "~~/shared/utils/attention-message";
import { buildInboxUrlQuery, parseInboxUrl, type InboxUrlState } from "~~/shared/utils/inbox-url";

// The User's own Inbox: Unread and All tabs and a Type select in the URL (written with `replace`), each Notification its
// own card, 20 per page with Previous and Next. Any signed-in User may open it; it needs no page Permission, and the API
// returns only what they may see right now.
definePageMeta({});

const ALL_TYPES = "__all__";
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const { session } = useAuthSession();
const localePath = useLocalePath();
useHead({ title: () => t("admin.notifications.title") });
useAdminBreadcrumbs([{ labelKey: "admin.nav.items.dashboard", to: localePath("/admin") }, { labelKey: "admin.notifications.title" }]);

const state = computed(() => parseInboxUrl(route.query));
const setState = (next: Partial<InboxUrlState>) => router.replace({ query: buildInboxUrlQuery({ ...state.value, page: 1, ...next }) });
const setPage = (page: number) => router.replace({ query: buildInboxUrlQuery({ ...state.value, page }) });

const types = computed(() => visibleAttentionTypes(session.value?.loggedIn ? (session.value.user?.permissions ?? []) : []));
const typeLabel = (type: AttentionType) => attentionTitle(type, locale.value === "en" ? "en" : "fa");

const list = useAdminInboxList(state);
const { markAllRead } = useInboxMutations();
const items = computed(() => list.data.value?.items ?? []);
const total = computed(() => list.data.value?.total ?? 0);
const from = computed(() => (items.value.length ? (state.value.page - 1) * ADMIN_PAGE_SIZE + 1 : 0));
const to = computed(() => (state.value.page - 1) * ADMIN_PAGE_SIZE + items.value.length);
</script>

<template>
  <AdminPageHeader :title="t('admin.notifications.title')" :icon="IconBell">
    <template #actions>
      <Button type="button" variant="outline" :disabled="markAllRead.isPending.value" data-slot="inbox-mark-all" @click="markAllRead.mutate()">{{ t("admin.notifications.markAllRead") }}</Button>
    </template>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <Tabs :model-value="state.tab" @update:model-value="(value) => setState({ tab: value === 'all' ? 'all' : 'unread' })">
        <TabsList :aria-label="t('admin.notifications.tabsLabel')">
          <TabsTrigger value="unread">{{ t("admin.notifications.tabs.unread") }}</TabsTrigger>
          <TabsTrigger value="all">{{ t("admin.notifications.tabs.all") }}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Select :model-value="state.type ?? ALL_TYPES" @update:model-value="(value) => setState({ type: value === ALL_TYPES ? undefined : (String(value) as AttentionType) })">
        <SelectTrigger class="w-64 max-w-full" :aria-label="t('admin.notifications.typeLabel')" data-slot="inbox-type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_TYPES">{{ t("admin.notifications.allTypes") }}</SelectItem>
          <SelectItem v-for="type in types" :key="type" :value="type">{{ typeLabel(type) }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div v-if="list.isError.value && !list.data.value" role="alert" class="flex flex-col items-start gap-3 rounded-lg border p-4" data-slot="inbox-error">
      <p class="text-sm font-medium">{{ t("admin.notifications.loadError") }}</p>
      <Button type="button" variant="outline" size="sm" @click="list.refetch()">{{ t("admin.shell.retry") }}</Button>
    </div>
    <div v-else-if="list.isPending.value" class="grid gap-2" aria-busy="true" data-slot="inbox-loading">
      <Skeleton v-for="n in 5" :key="n" class="h-16 w-full" />
    </div>
    <div v-else-if="items.length === 0" class="text-muted-foreground rounded-lg border p-10 text-center text-sm" data-slot="inbox-empty">
      {{ state.tab === "unread" ? t("admin.notifications.emptyUnread") : t("admin.notifications.emptyAll") }}
    </div>
    <div v-else class="flex flex-col gap-4" :class="list.isPlaceholderData.value ? 'opacity-60' : undefined">
      <ul class="grid gap-3" data-slot="inbox-list">
        <AdminInboxItem v-for="item in items" :key="item.id" :item="item" variant="card" />
      </ul>
      <DataTablePagination :from="from" :to="to" :total="total" :can-previous="state.page > 1" :can-next="to < total" @previous="setPage(state.page - 1)" @next="setPage(state.page + 1)" />
    </div>
  </AdminPageHeader>
</template>
