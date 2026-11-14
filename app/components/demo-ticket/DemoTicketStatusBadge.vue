<!-- demo-ticket:start (whole file) -->
<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEMO_TICKET_STATUS_MESSAGE_KEYS, DEMO_TICKET_STATUS_TONES, type DemoTicketStatus, type StatusTone } from "~~/shared/constants/demo-ticket";

// A status as a chip in its tone (open info, in progress progress, resolved success, closed neutral).
const props = defineProps<{ status: DemoTicketStatus }>();
const { t } = useI18n();

// Full class names, so Tailwind sees every one.
const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-status-neutral text-status-neutral-foreground",
  info: "bg-status-info text-status-info-foreground",
  progress: "bg-status-progress text-status-progress-foreground",
  warning: "bg-status-warning text-status-warning-foreground",
  success: "bg-status-success text-status-success-foreground",
  danger: "bg-status-danger text-status-danger-foreground",
};
const tone = computed(() => DEMO_TICKET_STATUS_TONES[props.status]);
</script>

<template>
  <Badge variant="outline" :class="cn('border-transparent', TONE_CLASS[tone])" :data-status="status" :data-tone="tone">{{ t(`admin.demoTickets.statuses.${DEMO_TICKET_STATUS_MESSAGE_KEYS[status]}`) }}</Badge>
</template>
