<!-- demo-ticket:start (whole file) -->
<script setup lang="ts">
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AdminBoardCard from "~/components/admin/board/AdminBoardCard.vue";
import AdminBoardColumn from "~/components/admin/board/AdminBoardColumn.vue";
import { useDemoTicketBoardColumn, type DemoTicketBoardFilters } from "~/composables/demo-ticket/useDemoTickets";
import { demoTicketPersonName } from "~/utils/demo-ticket-person";
import { DEMO_TICKET_STATUS_MESSAGE_KEYS, DEMO_TICKET_STATUS_TONES, type DemoTicketStatus, type StatusTone } from "~~/shared/constants/demo-ticket";
import type { DemoTicketRow } from "~~/shared/schemas/demo-ticket";
import { nextDemoTicketStatus } from "~~/shared/utils/demo-ticket-rules";
import DemoTicketWaitingChip from "./DemoTicketWaitingChip.vue";

// One Demo tickets Board column: its own query (20 tickets, "Show more" for the next 20) drawn in the shared
// AdminBoardColumn. A ticket moves only to the next status: the column accepts a drop only from the one before it.
const props = defineProps<{ status: DemoTicketStatus; filters: DemoTicketBoardFilters; canManage: boolean; dragFrom: string | null; highlightedId: string | null }>();
const emit = defineEmits<{ drop: [id: string, from: DemoTicketStatus]; move: [ticket: DemoTicketRow]; open: [ticket: DemoTicketRow]; total: [status: DemoTicketStatus, total: number | undefined] }>();
const { t, locale } = useI18n();
const statusLabel = (status: DemoTicketStatus) => t(`admin.demoTickets.statuses.${DEMO_TICKET_STATUS_MESSAGE_KEYS[status]}`);

const query = useDemoTicketBoardColumn(props.status, toRef(props, "filters"));
// A page boundary can shift while the column is open; a ticket shows once.
const tickets = computed(() => [...new Map((query.data.value?.pages.flatMap((page) => page.items) ?? []).map((ticket) => [ticket.id, ticket])).values()]);
// A column a status filter leaves out never loads: it is empty, not loading.
const idle = computed(() => !query.data.value && query.fetchStatus.value === "idle" && !query.isError.value);
const total = computed(() => query.data.value?.pages[0]?.total ?? (idle.value ? 0 : undefined));
watch(total, (value) => emit("total", props.status, value), { immediate: true });

const DOT_CLASS: Record<StatusTone, string> = {
  neutral: "bg-status-neutral-foreground",
  info: "bg-status-info-foreground",
  progress: "bg-status-progress-foreground",
  warning: "bg-status-warning-foreground",
  success: "bg-status-success-foreground",
  danger: "bg-status-danger-foreground",
};
const canDropFrom = (from: string) => props.canManage && nextDemoTicketStatus(from as DemoTicketStatus) === props.status;
const nextOf = (ticket: DemoTicketRow) => (props.canManage ? nextDemoTicketStatus(ticket.status) : null);
const personName = (ticket: DemoTicketRow) => (ticket.assignee ? demoTicketPersonName(ticket.assignee, t("admin.demoTickets.unnamedUser")) : t("admin.demoTickets.unassigned"));
</script>

<template>
  <AdminBoardColumn
    :column="status"
    :title="statusLabel(status)"
    :count="total"
    :shown="tickets.length"
    :loading="query.isPending.value && !idle"
    :failed="query.isError.value && !query.data.value"
    :stale="query.isPlaceholderData.value"
    :has-more="query.hasNextPage.value"
    :loading-more="query.isFetchingNextPage.value"
    :more-failed="query.isFetchNextPageError.value"
    :drag-from="dragFrom"
    :can-drop-from="canDropFrom"
    @drop="(id, from) => emit('drop', id, from as DemoTicketStatus)"
    @retry="query.refetch()"
    @more="query.fetchNextPage()"
  >
    <template #icon><span :class="cn('size-2.5 shrink-0 rounded-full', DOT_CLASS[DEMO_TICKET_STATUS_TONES[status]])" aria-hidden="true" /></template>
    <li v-for="ticket in tickets" :key="ticket.id">
      <AdminBoardCard
        :id="ticket.id"
        :column="status"
        :movable="nextOf(ticket) !== null"
        :highlighted="ticket.id === highlightedId"
        :handle-title="nextOf(ticket) ? t('admin.demoTickets.board.dragHandle', { status: statusLabel(nextOf(ticket)!) }) : undefined"
      >
        <template #bar>
          <Badge variant="outline" class="ms-auto" :data-priority="ticket.priority">{{ t(`admin.demoTickets.priorities.${ticket.priority}`) }}</Badge>
          <DemoTicketWaitingChip :ticket="ticket" />
        </template>
        <div class="grid gap-0.5">
          <button
            type="button"
            draggable="false"
            class="focus-visible:after:ring-ring text-start text-[15px] font-semibold break-words after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2"
            data-slot="board-card-open"
            dir="auto"
            @click="emit('open', ticket)"
          >
            {{ ticket.title }}
          </button>
          <p class="text-muted-foreground truncate text-[13px]">{{ personName(ticket) }}</p>
        </div>
        <Button v-if="nextOf(ticket)" type="button" size="sm" variant="secondary" class="relative z-10 w-full justify-between" data-slot="board-move" @click="emit('move', ticket)">
          {{ t("admin.demoTickets.board.moveTo", { status: statusLabel(nextOf(ticket)!) }) }}
          <IconArrowLeft v-if="locale !== 'en'" aria-hidden="true" /><IconArrowRight v-else aria-hidden="true" />
        </Button>
      </AdminBoardCard>
    </li>
  </AdminBoardColumn>
</template>
