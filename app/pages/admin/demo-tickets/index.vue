<!-- demo-ticket:start (whole file) -->
<script setup lang="ts">
import { IconPlus } from "@tabler/icons-vue";
import { useDebounceFn } from "@vueuse/core";
import { h } from "vue";
import type { ColumnDef } from "@tanstack/vue-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableEmpty, type DataTableFeatures } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_NAV_ICONS } from "~/components/admin/admin-nav-icons";
import AdminCardList from "~/components/admin/AdminCardList.vue";
import AdminRowCard from "~/components/admin/AdminRowCard.vue";
import AdminSearchInput from "~/components/admin/AdminSearchInput.vue";
import AdminViewSwitch from "~/components/admin/AdminViewSwitch.vue";
import type { AdminCardFact, AdminListView } from "~/components/admin/admin-list-view";
import DemoTicketBoard from "~/components/demo-ticket/DemoTicketBoard.vue";
import DemoTicketDialog from "~/components/demo-ticket/DemoTicketDialog.vue";
import DemoTicketThumbnail from "~/components/demo-ticket/DemoTicketThumbnail.vue";
import DemoTicketStatusBadge from "~/components/demo-ticket/DemoTicketStatusBadge.vue";
import DemoTicketWaitingChip from "~/components/demo-ticket/DemoTicketWaitingChip.vue";
import { useAdminCan } from "~/composables/admin/useAdminCan";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useDemoTicket, useDemoTicketAssignees, useDemoTicketsList } from "~/composables/demo-ticket/useDemoTickets";
import { DEMO_TICKET_PRIORITIES, DEMO_TICKET_STATUSES, DEMO_TICKET_STATUS_MESSAGE_KEYS } from "~~/shared/constants/demo-ticket";
import { ADMIN_PAGE_SIZE } from "~~/shared/schemas/admin-list";
import { DEMO_TICKET_UNASSIGNED, type DemoTicketRow } from "~~/shared/schemas/demo-ticket";
import { buildDemoTicketListUrlQuery, parseDemoTicketListUrl, type DemoTicketListState } from "~~/shared/utils/demo-ticket-list-url";
import { parseApiError } from "~~/shared/utils/api-error-client";

// The Demo tickets list (.specs/demo-tickets/spec.md): a Table, Cards or Board of the same tickets (the view lives in
// page memory only, ADR-0027). Newest first, 20 per page, search by title, the status, priority and assignee filters in the URL. A row opens the ticket's dialog; `?ticket=<id>` opens it directly.
definePageMeta({ permission: "view-demo-tickets" });

const { t, date } = useAdminFormat();
const route = useRoute();
const router = useRouter();
const can = useAdminCan();
useHead({ title: () => t("admin.nav.items.demoTickets") });
const canManage = computed(() => can("manage-demo-tickets"));
const view = ref<AdminListView>("table");
// The Board lists by status, so it takes the search and the filters but not the page.
const boardFilters = computed(() => ({ q: state.value.q, status: state.value.status, priority: state.value.priority, assignee: state.value.assignee }));

// The URL is the single source of the list state; every change replaces the history entry.
const state = computed(() => parseDemoTicketListUrl(route.query));
const hasFilters = computed(() => Boolean(state.value.q || state.value.status || state.value.priority || state.value.assignee));
const replaceState = (next: DemoTicketListState) => router.replace({ query: buildDemoTicketListUrlQuery(next) });
const setState = (next: Partial<DemoTicketListState>) => replaceState({ ...state.value, page: 1, ...next });
const clearFilters = () => router.replace({ query: state.value.ticket ? { ticket: state.value.ticket } : {} });

const searchText = ref(state.value.q ?? "");
watch(
  () => state.value.q,
  (value) => (searchText.value = value ?? ""),
);
const applySearch = useDebounceFn((value: string) => setState({ q: value.trim() || undefined }), 300);
watch(searchText, (value) => {
  if (value.trim() !== (state.value.q ?? "")) applySearch(value);
});

const list = useDemoTicketsList(state);
const total = computed(() => list.data.value?.total ?? 0);
// A page past the end moves to the last page (the server answers 200 with no rows).
watch(
  () => list.data.value,
  (data) => {
    if (data && data.items.length === 0 && data.total > 0 && state.value.page > 1) replaceState({ ...state.value, page: Math.ceil(data.total / ADMIN_PAGE_SIZE) });
  },
);

const ALL = "all";
const assignees = useDemoTicketAssignees();
const personName = (person: Parameters<typeof demoTicketPersonName>[0]) => demoTicketPersonName(person, t("admin.demoTickets.unnamedUser"));

// The dialog: a new ticket, or the one named by `?ticket=<id>` (a row click sets it).
const newOpen = ref(false);
const ticketId = computed(() => state.value.ticket);
const one = useDemoTicket(ticketId);
const fromList = computed(() => list.data.value?.items.find((row) => row.id === ticketId.value) ?? null);
const openTicket = computed(() => one.data.value ?? fromList.value);
const oneFailure = computed<"error" | "gone" | null>(() => (!one.isError.value || openTicket.value ? null : parseApiError(one.error.value).status === 404 ? "gone" : "error"));
const dialogOpen = computed({
  get: () => newOpen.value || Boolean(ticketId.value),
  set: (value: boolean) => {
    if (value) return;
    newOpen.value = false;
    if (ticketId.value) replaceState({ ...state.value, ticket: undefined });
  },
});
const openRow = (row: DemoTicketRow) => replaceState({ ...state.value, ticket: row.id });
const closeDialog = () => (dialogOpen.value = false);

// A Card's labelled values: the ones the Table shows besides the title, status and priority.
const cardFacts = (ticket: DemoTicketRow): AdminCardFact[] => [
  { label: t("admin.demoTickets.columns.assignee"), value: ticket.assignee ? personName(ticket.assignee) : t("admin.demoTickets.unassigned") },
  { label: t("admin.demoTickets.columns.created"), value: date(ticket.createdAt) },
];

const columns = computed<ColumnDef<DataTableFeatures, DemoTicketRow>[]>(() => [
  {
    id: "title",
    header: t("admin.demoTickets.columns.title"),
    cell: ({ row }) =>
      h("span", { class: "flex flex-wrap items-center gap-2" }, [
        h(
          "button",
          { type: "button", class: "text-start font-medium hover:underline focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-3", onClick: (event: Event) => (event.stopPropagation(), openRow(row.original)) },
          row.original.title,
        ),
        h(DemoTicketWaitingChip, { ticket: row.original }),
      ]),
  },
  { id: "status", header: t("admin.demoTickets.columns.status"), cell: ({ row }) => h(DemoTicketStatusBadge, { status: row.original.status }) },
  { id: "priority", header: t("admin.demoTickets.columns.priority"), cell: ({ row }) => h(Badge, { variant: row.original.priority === "high" ? "default" : "outline", "data-priority": row.original.priority }, () => t(`admin.demoTickets.priorities.${row.original.priority}`)) },
  {
    id: "assignee",
    header: t("admin.demoTickets.columns.assignee"),
    cell: ({ row }) => (row.original.assignee ? h("span", personName(row.original.assignee)) : h("span", { class: "text-muted-foreground" }, t("admin.demoTickets.unassigned"))),
  },
  { id: "created", header: t("admin.demoTickets.columns.created"), cell: ({ row }) => h("span", { class: "whitespace-nowrap" }, date(row.original.createdAt)) },
]);
</script>

<template>
  <div class="flex flex-col gap-4">
    <AdminPageHeader :title="t('admin.nav.items.demoTickets')" :icon="ADMIN_NAV_ICONS['demo-tickets']">
      <template v-if="canManage" #actions>
        <Button type="button" data-slot="new-demo-ticket" @click="newOpen = true"><IconPlus aria-hidden="true" />{{ t("admin.demoTickets.newButton") }}</Button>
      </template>
      <template #toolbar>
        <div class="flex w-full flex-wrap items-center gap-2" role="search">
          <AdminSearchInput v-model="searchText" class="max-w-xs min-w-48 flex-1" :aria-label="t('admin.demoTickets.searchLabel')" :placeholder="t('admin.demoTickets.searchPlaceholder')" />
          <Select :model-value="state.status ?? ALL" @update:model-value="(value) => setState({ status: value === ALL ? undefined : (String(value) as DemoTicketListState['status']) })">
            <SelectTrigger class="w-44" :aria-label="t('admin.demoTickets.filters.status')"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL">{{ t("admin.demoTickets.filters.allStatuses") }}</SelectItem>
              <SelectItem v-for="status in DEMO_TICKET_STATUSES" :key="status" :value="status">{{ t(`admin.demoTickets.statuses.${DEMO_TICKET_STATUS_MESSAGE_KEYS[status]}`) }}</SelectItem>
            </SelectContent>
          </Select>
          <Select :model-value="state.priority ?? ALL" @update:model-value="(value) => setState({ priority: value === ALL ? undefined : (String(value) as DemoTicketListState['priority']) })">
            <SelectTrigger class="w-44" :aria-label="t('admin.demoTickets.filters.priority')"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL">{{ t("admin.demoTickets.filters.allPriorities") }}</SelectItem>
              <SelectItem v-for="priority in DEMO_TICKET_PRIORITIES" :key="priority" :value="priority">{{ t(`admin.demoTickets.priorities.${priority}`) }}</SelectItem>
            </SelectContent>
          </Select>
          <Select :model-value="state.assignee ?? ALL" @update:model-value="(value) => setState({ assignee: value === ALL ? undefined : String(value) })">
            <SelectTrigger class="w-48" :aria-label="t('admin.demoTickets.filters.assignee')"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL">{{ t("admin.demoTickets.filters.allAssignees") }}</SelectItem>
              <SelectItem :value="DEMO_TICKET_UNASSIGNED">{{ t("admin.demoTickets.unassigned") }}</SelectItem>
              <SelectItem v-for="person in assignees.data.value?.items ?? []" :key="person.id" :value="person.id">{{ personName(person) }}</SelectItem>
            </SelectContent>
          </Select>
          <Button v-if="hasFilters" type="button" variant="ghost" @click="clearFilters">{{ t("admin.demoTickets.clearFilters") }}</Button>
          <AdminViewSwitch v-model="view" :views="['table', 'cards', 'board']" />
        </div>
      </template>
    </AdminPageHeader>

    <DemoTicketBoard v-if="view === 'board'" :filters="boardFilters" :has-filters="hasFilters" :can-manage="canManage" @clear-filters="clearFilters" @open="openRow" />
    <div v-else-if="list.isError.value && !list.data.value" role="alert" class="flex flex-col items-start gap-3 rounded-lg border p-4">
      <p class="text-sm font-medium">{{ t("admin.demoTickets.loadError") }}</p>
      <Button type="button" variant="outline" size="sm" @click="list.refetch()">{{ t("admin.shell.retry") }}</Button>
    </div>
    <div v-else-if="list.isPending.value" class="grid gap-2" data-slot="list-loading" aria-busy="true">
      <Skeleton v-for="n in 5" :key="n" class="h-14 w-full" />
    </div>
    <div v-else-if="view === 'cards'" :class="list.isPlaceholderData.value ? 'opacity-60' : undefined">
      <AdminCardList :items="list.data.value?.items ?? []" :total="total" :page-size="ADMIN_PAGE_SIZE" layout="rows" :label="t('admin.nav.items.demoTickets')" :page="state.page" @update:page="(next: number) => replaceState({ ...state, page: next })">
        <template #default="{ item }">
          <AdminRowCard :title="item.title" :facts="cardFacts(item)">
            <template #media><DemoTicketThumbnail :image="item.image" /></template>
            <template #badges>
              <DemoTicketStatusBadge :status="item.status" />
              <Badge :variant="item.priority === 'high' ? 'default' : 'outline'" :data-priority="item.priority">{{ t(`admin.demoTickets.priorities.${item.priority}`) }}</Badge>
              <DemoTicketWaitingChip :ticket="item" />
            </template>
            <template #actions>
              <Button type="button" variant="outline" size="sm" :aria-label="t('admin.demoTickets.cards.openNamed', { title: item.title })" @click="openRow(item)">{{ t("admin.demoTickets.cards.open") }}</Button>
            </template>
          </AdminRowCard>
        </template>
        <template #empty>
          <DataTableEmpty v-if="hasFilters" :title="t('admin.demoTickets.noResults.title')" :description="t('admin.demoTickets.noResults.description')">
            <Button type="button" variant="outline" @click="clearFilters">{{ t("admin.demoTickets.clearFilters") }}</Button>
          </DataTableEmpty>
          <DataTableEmpty v-else :title="t('admin.demoTickets.empty.title')" :description="t('admin.demoTickets.empty.description')" />
        </template>
      </AdminCardList>
    </div>
    <div v-else class="overflow-x-auto" :class="list.isPlaceholderData.value ? 'opacity-60' : undefined">
      <DataTable
        :columns="columns"
        :data="list.data.value?.items ?? []"
        :row-count="total"
        :page-size="ADMIN_PAGE_SIZE"
        :page="state.page"
        clickable-rows
        @row-click="openRow"
        @update:page="(next: number) => replaceState({ ...state, page: next })"
      >
        <template #empty>
          <DataTableEmpty v-if="hasFilters" :title="t('admin.demoTickets.noResults.title')" :description="t('admin.demoTickets.noResults.description')">
            <Button type="button" variant="outline" @click="clearFilters">{{ t("admin.demoTickets.clearFilters") }}</Button>
          </DataTableEmpty>
          <DataTableEmpty v-else :title="t('admin.demoTickets.empty.title')" :description="t('admin.demoTickets.empty.description')" />
        </template>
      </DataTable>
    </div>

    <DemoTicketDialog
      :open="dialogOpen"
      :ticket="newOpen ? null : openTicket"
      :loading="!newOpen && Boolean(ticketId) && !openTicket && !oneFailure"
      :failed="newOpen ? null : oneFailure"
      :can-manage="canManage"
      @update:open="(value: boolean) => (dialogOpen = value)"
      @saved="closeDialog"
      @deleted="closeDialog"
      @retry="one.refetch()"
    />
  </div>
</template>
