<script setup lang="ts">
import { IconDots } from "@tabler/icons-vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { INBOX_TYPE_COLORS, INBOX_TYPE_ICONS } from "~/components/admin/inbox-icons";
import { useInboxMutations } from "~/composables/admin/useAdminInbox";
import type { InboxItem } from "~~/shared/schemas/admin-notifications";
import { renderAttentionText } from "~~/shared/utils/attention-message";
import { formatDateTime } from "~~/shared/utils/format-date";
import { localizedPath } from "~~/shared/utils/locale-path";
import { formatRelativeTime } from "~~/shared/utils/relative-time";

// One Inbox item, shared by the bell's Popover (a row in a list) and the Inbox page (its own card): a type icon in the
// event's own colour, the text in the User's locale, a relative time with the exact time in a tooltip, an Open or Done
// badge and an unread dot. A done item is dimmed by a muted title, never by opacity on text, which would fail contrast.
// Clicking marks it read and opens its link; the menu toggles read state.
const props = withDefaults(defineProps<{ item: InboxItem; variant?: "row" | "card" }>(), { variant: "row" });
const emit = defineEmits<{ navigate: [] }>();

const { t, locale } = useI18n();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const { markRead, markUnread } = useInboxMutations();

const title = computed(() => renderAttentionText(props.item.type, props.item.tokens, digits.value));
const done = computed(() => props.item.resolvedAt !== null);
const href = computed(() => localizedPath(props.item.link, digits.value));
const relative = computed(() => formatRelativeTime(props.item.createdAt, new Date(), digits.value));
const exact = computed(() => formatDateTime(props.item.createdAt, digits.value));

// The link opens right away; the read mark is a best-effort side effect that never blocks navigation.
function open() {
  if (!props.item.read) markRead.mutate(props.item.id);
  emit("navigate");
}
const toggleRead = () => (props.item.read ? markUnread.mutate(props.item.id) : markRead.mutate(props.item.id));
</script>

<template>
  <li
    data-slot="inbox-item"
    :data-variant="variant"
    :data-read="item.read"
    :data-done="done"
    :class="
      cn(
        'flex items-start gap-2',
        variant === 'card' ? 'bg-card text-card-foreground rounded-xl border p-4 shadow-xs transition-shadow hover:shadow-md' : 'px-3 py-3',
        variant === 'card' && !item.read && !done && 'border-primary/40',
        done && (variant === 'card' ? 'bg-muted/40' : 'bg-muted/30'),
      )
    "
  >
    <NuxtLink :to="href" class="focus-visible:ring-ring flex min-w-0 flex-1 items-start gap-3 rounded-md outline-none focus-visible:ring-2" @click="open">
      <span :class="cn('flex shrink-0 items-center justify-center rounded-xl', variant === 'card' ? 'size-12' : 'size-10', INBOX_TYPE_COLORS[item.type], done && 'opacity-60')">
        <component :is="INBOX_TYPE_ICONS[item.type]" :class="variant === 'card' ? 'size-6' : 'size-5'" aria-hidden="true" />
      </span>
      <span class="grid min-w-0 gap-1">
        <span :class="cn(variant === 'card' ? 'text-base' : 'text-sm', !item.read && 'font-semibold', done && 'text-muted-foreground')" data-slot="inbox-title">{{ title }}</span>
        <span class="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger as-child>
              <time :datetime="item.createdAt" class="text-muted-foreground text-xs" data-slot="inbox-time">{{ relative }}</time>
            </TooltipTrigger>
            <TooltipContent>{{ exact }}</TooltipContent>
          </Tooltip>
          <Badge :variant="done ? 'secondary' : 'outline'" data-slot="inbox-state">{{ done ? t("admin.notifications.done") : t("admin.notifications.open") }}</Badge>
        </span>
      </span>
      <span v-if="!item.read" class="bg-primary mt-2 size-2 shrink-0 rounded-full" data-slot="inbox-unread-dot" role="img" :aria-label="t('admin.notifications.unreadDot')" />
    </NuxtLink>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button type="button" variant="ghost" size="icon-sm" :aria-label="t('admin.notifications.actions', { title })">
          <IconDots aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem data-slot="inbox-toggle-read" @select="toggleRead">{{ item.read ? t("admin.notifications.markUnread") : t("admin.notifications.markRead") }}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </li>
</template>
