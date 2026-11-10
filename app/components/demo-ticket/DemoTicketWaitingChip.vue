<!-- demo-ticket:start (whole file) -->
<script setup lang="ts">
import { IconClockHour4 } from "@tabler/icons-vue";
import { Badge } from "@/components/ui/badge";
import type { DemoTicketRow } from "~~/shared/schemas/demo-ticket";
import { isWaitingLong } from "~~/shared/utils/demo-ticket-rules";

// The "waiting long" chip: a ticket open for more than 24 hours or in progress for more than 48 hours.
const props = defineProps<{ ticket: Pick<DemoTicketRow, "status" | "statusSince"> }>();
const { t } = useI18n();
// Read once on the client: the list only renders there.
const visible = computed(() => isWaitingLong(props.ticket.status, props.ticket.statusSince, new Date()));
</script>

<template>
  <Badge v-if="visible" variant="outline" class="border-transparent bg-status-warning text-status-warning-foreground" data-slot="waiting-long" :title="t('admin.demoTickets.waitingLongHint')">
    <IconClockHour4 aria-hidden="true" />{{ t("admin.demoTickets.waitingLong") }}
  </Badge>
</template>
