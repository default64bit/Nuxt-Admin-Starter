<script setup lang="ts">
import { IconChevronRight } from "@tabler/icons-vue";
import { Badge } from "@/components/ui/badge";
import AdminAuditEventDetails from "~/components/admin/AdminAuditEventDetails.vue";
import type { AdminAuditListItem } from "~~/shared/schemas/admin-audit-log";
import { auditActionLabelPath, isKnownAuditAction } from "~~/shared/constants/audit-actions";
import { auditActorName } from "~~/shared/utils/audit-feed";
import { formatTime } from "~~/shared/utils/format-date";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";

// One audit event in the feed (.specs/audit-log/spec.md "Event card" and "Details panel"): a line (label, actor,
// change count), a footer with the quoted reason and the time, a dot plus a badge on any outcome but `success`, and
// an animated Details panel. The whole card is the click target; the Details button stays for keyboard users. All
// dynamic text is plain text isolated with <bdi> so mixed-script values cannot reorder the line in RTL.
const props = defineProps<{ event: AdminAuditListItem }>();
const { t, locale } = useI18n();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const known = computed(() => isKnownAuditAction(props.event.action));
const label = computed(() => (isKnownAuditAction(props.event.action) ? t(auditActionLabelPath(props.event.action)) : props.event.action));
const actor = computed(() => {
  const resolved = auditActorName(props.event.actor);
  return resolved.kind === "system" ? { text: t("admin.auditLog.actor.system"), phone: false } : { text: resolved.text, phone: resolved.kind === "phone" };
});
const changes = computed(() => t("admin.auditLog.changes.count", { count: toLocaleDigits(String(props.event.changeCount), digits.value) }, props.event.changeCount));
const time = computed(() => formatTime(props.event.createdAt, digits.value));
const denied = computed(() => props.event.outcome !== "success");

const open = ref(false);
// The detail is requested the first time the card opens, and kept after it closes.
const firstOpened = ref(false);
function toggle() {
  open.value = !open.value;
  if (open.value) firstOpened.value = true;
}
const panelId = `audit-panel-${props.event.id}`;
</script>

<template>
  <li class="relative ps-4" data-slot="audit-event" :data-outcome="event.outcome" :data-action="event.action">
    <span class="absolute -start-[5px] top-4 size-2.5 rounded-full" :class="denied ? 'bg-destructive' : 'bg-muted-foreground/50'" data-slot="audit-dot" aria-hidden="true" />
    <article class="hover:bg-muted/40 grid cursor-pointer gap-1.5 rounded-lg border p-3 text-sm transition-colors" @click="toggle">
      <p class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <bdi v-if="known" class="font-medium" data-slot="action-label">{{ label }}</bdi>
        <bdi v-else class="font-mono text-xs font-medium" dir="ltr" data-slot="raw-action">{{ label }}</bdi>
        <span class="text-muted-foreground">·</span>
        <bdi class="text-muted-foreground" :dir="actor.phone ? 'ltr' : undefined" data-slot="actor">{{ actor.text }}</bdi>
        <span class="text-muted-foreground">·</span>
        <span class="text-muted-foreground" data-slot="change-count">{{ changes }}</span>
        <Badge v-if="denied" variant="destructive" data-slot="outcome-badge">{{ t(`admin.auditLog.outcome.${event.outcome}`) }}</Badge>
      </p>
      <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p v-if="event.reason" class="text-muted-foreground min-w-0 flex-1 break-words" data-slot="reason"><bdi>{{ t("admin.auditLog.reason", { reason: event.reason }) }}</bdi></p>
        <time class="text-muted-foreground ms-auto text-xs" :datetime="event.createdAt" data-slot="time">{{ time }}</time>
      </div>
      <button type="button" class="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex w-fit items-center gap-1 rounded-sm text-xs outline-none focus-visible:ring-2" :aria-expanded="open" :aria-controls="panelId" data-slot="details-toggle">
        <IconChevronRight class="size-4 transition-transform duration-300 motion-reduce:transition-none rtl:-scale-x-100" :class="open ? 'rotate-90' : ''" aria-hidden="true" />
        {{ t("admin.auditLog.details.toggle") }}
      </button>
      <div :id="panelId" class="grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none" :class="open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'" :inert="!open" data-slot="details-panel" :data-state="open ? 'open' : 'closed'" @click.stop>
        <div class="min-h-0 overflow-hidden">
          <div class="border-t pt-2">
            <AdminAuditEventDetails v-if="firstOpened" :id="event.id" :open="open" :first-opened="firstOpened" :link="event.link" />
          </div>
        </div>
      </div>
    </article>
  </li>
</template>
