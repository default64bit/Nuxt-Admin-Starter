<!-- demo-ticket:start (whole file) -->
<script setup lang="ts">
import { announce } from "@atlaskit/pragmatic-drag-and-drop-live-region";
import { useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { DataTableEmpty } from "@/components/ui/data-table";
import AdminBoard from "~/components/admin/board/AdminBoard.vue";
import { DEMO_TICKETS_KEY, useDemoTicketMutations, useOptimisticDemoTicketMove, type DemoTicketBoardFilters } from "~/composables/demo-ticket/useDemoTickets";
import { DEMO_TICKET_STATUSES, DEMO_TICKET_STATUS_MESSAGE_KEYS, type DemoTicketStatus } from "~~/shared/constants/demo-ticket";
import type { DemoTicketRow } from "~~/shared/schemas/demo-ticket";
import { parseApiError } from "~~/shared/utils/api-error-client";
import { nextDemoTicketStatus } from "~~/shared/utils/demo-ticket-rules";
import DemoTicketBoardColumn from "./DemoTicketBoardColumn.vue";

// The Demo tickets Board (.specs/demo-tickets/spec.md "Board view"): one column per status in the shared
// AdminBoard. A User with manage Permission moves a ticket one status forward by dragging its top bar or with its
// button; the move shows at once, is announced in a live region, and is undone (with the ticket refetched) when the
// server refuses it, for example with 409 because someone else moved the ticket first. Read-only otherwise.
const props = defineProps<{ filters: DemoTicketBoardFilters; hasFilters: boolean; canManage: boolean }>();
const emit = defineEmits<{ clearFilters: []; open: [ticket: DemoTicketRow] }>();
const { t } = useI18n();
const statusLabel = (status: DemoTicketStatus) => t(`admin.demoTickets.statuses.${DEMO_TICKET_STATUS_MESSAGE_KEYS[status]}`);

// Every column loaded and empty.
const totals = ref<Partial<Record<DemoTicketStatus, number | undefined>>>({});
const allEmpty = computed(() => DEMO_TICKET_STATUSES.every((status) => totals.value[status] === 0));
const setTotal = (status: DemoTicketStatus, total: number | undefined) => (totals.value = { ...totals.value, [status]: total });

const queryClient = useQueryClient();
const optimisticMove = useOptimisticDemoTicketMove();
const { update } = useDemoTicketMutations();
const board = ref<InstanceType<typeof AdminBoard> | null>(null);
const highlightedId = ref<string | null>(null);

async function run(ticket: DemoTicketRow) {
  const to = nextDemoTicketStatus(ticket.status);
  // One move at a time: the next one needs the version the refetch brings.
  if (!to || update.isPending.value) return;
  const undo = optimisticMove(ticket, to, props.filters);
  try {
    await update.mutateAsync({ id: ticket.id, body: { status: to, expectedUpdatedAt: ticket.updatedAt } });
    announce(t("admin.demoTickets.board.moved", { title: ticket.title, status: statusLabel(to) }));
    highlightedId.value = ticket.id;
    setTimeout(() => highlightedId.value === ticket.id && (highlightedId.value = null), 2000);
    board.value?.showColumn(to);
  } catch (error) {
    undo();
    announce(t("admin.demoTickets.board.returned", { title: ticket.title, status: statusLabel(ticket.status) }));
    const parsed = parseApiError(error);
    // Someone else changed or removed the ticket first (409 / 404), or the Permission went away (403): show the truth.
    if (parsed.status === 409 || parsed.status === 404) toast.error(t("admin.demoTickets.board.stale"));
    else if (parsed.status !== 403 && parsed.status !== 401) toast.error(t("admin.demoTickets.board.failed"));
    void queryClient.invalidateQueries({ queryKey: DEMO_TICKETS_KEY });
  }
}

/** A drop names the ticket by id; find it in the source column's cache. */
function onDrop(id: string, from: DemoTicketStatus) {
  const ticket = queryClient
    .getQueriesData<{ pages: { items: DemoTicketRow[] }[] }>({ queryKey: [...DEMO_TICKETS_KEY, "board", from] })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? [])
    .find((item) => item.id === id);
  if (ticket) void run(ticket);
}
</script>

<template>
  <div class="flex flex-col gap-3" data-slot="demo-ticket-board">
    <template v-if="allEmpty">
      <DataTableEmpty v-if="hasFilters" :title="t('admin.demoTickets.noResults.title')" :description="t('admin.demoTickets.noResults.description')">
        <Button type="button" variant="outline" @click="emit('clearFilters')">{{ t("admin.demoTickets.clearFilters") }}</Button>
      </DataTableEmpty>
      <DataTableEmpty v-else :title="t('admin.demoTickets.empty.title')" :description="t('admin.demoTickets.empty.description')" />
    </template>
    <AdminBoard ref="board" :columns="DEMO_TICKET_STATUSES" :label="t('admin.demoTickets.board.label')" :hint="canManage ? t('admin.demoTickets.board.hint') : t('admin.demoTickets.board.viewOnly')" :hidden="allEmpty">
      <template #column="{ column, dragFrom }">
        <DemoTicketBoardColumn
          :status="column as DemoTicketStatus"
          :filters="filters"
          :can-manage="canManage"
          :drag-from="dragFrom"
          :highlighted-id="highlightedId"
          @drop="onDrop"
          @move="run"
          @open="emit('open', $event)"
          @total="setTotal"
        />
      </template>
    </AdminBoard>
  </div>
</template>
