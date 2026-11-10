<script setup lang="ts">
import { IconBell, IconSettings } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminInboxItem from "~/components/admin/AdminInboxItem.vue";
import { useAdminInboxPopover, useInboxMutations } from "~/composables/admin/useAdminInbox";
import { alertPulse } from "~/composables/admin/useAdminLiveAlerts";
import { useAdminNavCounts } from "~/composables/admin/useAdminNavCounts";
import { formatNavCount } from "~~/shared/schemas/admin-nav-counts";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";
import { localizedPath } from "~~/shared/utils/locale-path";

// The top-bar bell. The unread badge comes from the nav-counts query; if that fails the bell still works, with no badge.
// At `md` and up it opens a Popover with Unread and Read tabs (the newest items of each) and a cog to the Notification
// settings; below `md` it is a plain link to the Inbox page, because a popover is too cramped on a phone.
const { t, locale } = useI18n();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const { counts } = useAdminNavCounts(computed(() => true));
const unread = computed(() => counts.value.inboxUnread ?? 0);
const badge = computed(() => formatNavCount(unread.value, digits.value));
const label = computed(() =>
  unread.value > 0 ? t("admin.notifications.bellUnread", { count: toLocaleDigits(unread.value > 99 ? "99+" : String(unread.value), digits.value) }) : t("admin.notifications.bell"),
);
const pagePath = computed(() => localizedPath("/admin/notifications", digits.value));

// A faded round background so the bell reads as a button, not a bare icon.
const bellClass = "bg-muted/60 hover:bg-muted rounded-full";
const open = ref(false);
const tab = ref<"unread" | "read">("unread");
const popover = useAdminInboxPopover(open, tab);
const settingsPath = computed(() => localizedPath("/admin/account/notifications", digits.value));
const { markAllRead } = useInboxMutations();
const items = computed(() => popover.data.value?.items ?? []);

// A new batch rings the bell for about a second and pops the badge. With `prefers-reduced-motion` nothing moves; the
// badge simply updates.
const RING_MS = 1000;
const ringing = ref(false);
let ringTimer: ReturnType<typeof setTimeout> | undefined;
watch(alertPulse, async () => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  clearTimeout(ringTimer);
  ringing.value = false;
  await nextTick(); // restart the animation when a second batch comes while the first still rings
  ringing.value = true;
  ringTimer = setTimeout(() => (ringing.value = false), RING_MS);
});
onBeforeUnmount(() => clearTimeout(ringTimer));
</script>

<template>
  <div data-slot="inbox-bell" class="flex items-center">
    <Button as-child variant="ghost" size="icon" :class="cn('relative md:hidden', bellClass)" :aria-label="label">
      <NuxtLink :to="pagePath" data-slot="inbox-bell-link">
        <IconBell aria-hidden="true" :data-ringing="ringing" />
        <span v-if="badge" :data-popping="ringing" class="bg-primary text-primary-foreground absolute -end-1 -top-1 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-medium" data-slot="inbox-badge" aria-hidden="true">{{ badge }}</span>
      </NuxtLink>
    </Button>
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button type="button" variant="ghost" size="icon" :class="cn('relative max-md:hidden', bellClass)" :aria-label="label" data-slot="inbox-bell-button">
          <IconBell aria-hidden="true" :data-ringing="ringing" />
          <span v-if="badge" :data-popping="ringing" class="bg-primary text-primary-foreground absolute -end-1 -top-1 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-medium" data-slot="inbox-badge" aria-hidden="true">{{ badge }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" class="w-96 p-0 shadow-xl" data-slot="inbox-popover">
        <div class="border-border/50 flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 class="text-sm font-semibold">{{ t("admin.notifications.title") }}</h2>
          <div class="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" :disabled="markAllRead.isPending.value || unread === 0" data-slot="inbox-mark-all" @click="markAllRead.mutate()">
              {{ t("admin.notifications.markAllRead") }}
            </Button>
            <Button as-child variant="ghost" size="icon-sm" :aria-label="t('admin.notifications.settingsLink')">
              <NuxtLink :to="settingsPath" data-slot="inbox-settings" @click="open = false"><IconSettings aria-hidden="true" /></NuxtLink>
            </Button>
          </div>
        </div>
        <div class="border-border/50 border-b px-3 py-2">
          <Tabs v-model="tab">
            <TabsList class="w-full" :aria-label="t('admin.notifications.tabsLabel')">
              <TabsTrigger value="unread" class="flex-1" data-slot="inbox-popover-tab-unread">{{ t("admin.notifications.tabs.unread") }}</TabsTrigger>
              <TabsTrigger value="read" class="flex-1" data-slot="inbox-popover-tab-read">{{ t("admin.notifications.tabs.read") }}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div v-if="popover.isError.value" role="alert" class="text-muted-foreground flex flex-col items-start gap-2 p-3 text-sm" data-slot="inbox-popover-error">
          <p>{{ t("admin.notifications.popoverError") }}</p>
          <Button type="button" variant="outline" size="sm" @click="popover.refetch()">{{ t("admin.shell.retry") }}</Button>
        </div>
        <div v-else-if="popover.isPending.value" class="grid gap-2 p-3" aria-busy="true" data-slot="inbox-popover-loading">
          <Skeleton v-for="n in 3" :key="n" class="h-10 w-full" />
        </div>
        <p v-else-if="items.length === 0" class="text-muted-foreground p-4 text-center text-sm" data-slot="inbox-popover-empty">{{ tab === "unread" ? t("admin.notifications.popoverEmpty") : t("admin.notifications.popoverEmptyRead") }}</p>
        <ul v-else class="divide-border/50 max-h-96 divide-y overflow-y-auto">
          <AdminInboxItem v-for="item in items" :key="item.id" :item="item" @navigate="open = false" />
        </ul>
        <div class="border-border/50 border-t p-2">
          <Button as-child variant="ghost" size="sm" class="w-full">
            <NuxtLink :to="pagePath" data-slot="inbox-view-all" @click="open = false">{{ t("admin.notifications.viewAll") }}</NuxtLink>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
