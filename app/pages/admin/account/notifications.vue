<script setup lang="ts">
import { IconBell } from "@tabler/icons-vue";
import { toast } from "vue-sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAdminBreadcrumbs } from "~/composables/admin/useAdminBreadcrumbs";
import { useAdminNotificationSettings, useSaveNotificationSettings } from "~/composables/admin/useAdminNotificationSettings";
import { useAdminSoundPreference } from "~/composables/admin/useAdminSoundPreference";
import { LOCALES, type Locale } from "~~/shared/constants/database-enums";
import type { ChannelSettings } from "~~/shared/schemas/admin-notification-settings";
import { parseApiError } from "~~/shared/utils/api-error-client";
import { formatDateTime } from "~~/shared/utils/format-date";

// The User's own notification settings, in two sections: "Your account" (one card per installed Channel and the Message
// language they all use; saved together) and "This device" (the alert sound of this browser, applied at once and stored
// in the browser, so it sits outside the Save form). The Inbox itself cannot be turned off, so it has no card. A
// Channel card appears only when its adapter is installed. Any signed-in User may open it; it changes only their own choices.
definePageMeta({});

const { t, locale } = useI18n();
const localePath = useLocalePath();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
useHead({ title: () => t("admin.account.notifications.title") });
useAdminBreadcrumbs([{ labelKey: "admin.nav.items.dashboard", to: localePath("/admin") }, { labelKey: "admin.account.notifications.title" }]);

const query = useAdminNotificationSettings();
const save = useSaveNotificationSettings();
const sound = useAdminSoundPreference();
const settings = computed(() => query.data.value);

// The edits in progress; the saved values come from the server and replace them after a save.
const enabled = ref<Record<string, boolean>>({});
const messageLocale = ref<Locale>("fa");
watch(
  settings,
  (value) => {
    if (!value) return;
    enabled.value = Object.fromEntries(value.channels.map((channel) => [channel.key, channel.enabled]));
    messageLocale.value = value.locale;
  },
  { immediate: true },
);
const dirty = computed(() => Boolean(settings.value) && (messageLocale.value !== settings.value!.locale || settings.value!.channels.some((channel) => enabled.value[channel.key] !== channel.enabled)));

/** Which of a Channel card's four states it is in. */
function stateOf(channel: ChannelSettings): "connected" | "notConnected" | "unavailable" | "degraded" {
  if (channel.availability === "not_configured" || channel.availability === "disabled") return "unavailable";
  if (channel.availability === "degraded") return "degraded";
  return channel.connected ? "connected" : "notConnected";
}
const badgeOf = (channel: ChannelSettings) => t(`admin.account.notifications.badge.${stateOf(channel)}`);

async function submit() {
  if (!settings.value || !dirty.value || save.isPending.value) return;
  try {
    await save.mutateAsync({ channels: Object.fromEntries(settings.value.channels.map((channel) => [channel.key, enabled.value[channel.key]])) as never, locale: messageLocale.value });
    toast.success(t("admin.account.notifications.saved"));
  } catch (failed) {
    if (![401, 403].includes(parseApiError(failed).status ?? 0)) toast.error(t("admin.account.notifications.saveFailed"));
  }
}
</script>

<template>
  <AdminPageHeader :title="t('admin.account.notifications.title')" :icon="IconBell">
    <div class="grid w-full max-w-3xl gap-4">
      <p class="text-muted-foreground text-sm" data-slot="inbox-note">{{ t("admin.account.notifications.inboxNote") }}</p>

      <section class="grid gap-4" data-slot="your-account" aria-labelledby="your-account-title">
        <div class="grid gap-1">
          <h2 id="your-account-title" class="text-lg font-semibold">{{ t("admin.account.notifications.account.title") }}</h2>
          <p class="text-muted-foreground text-sm">{{ t("admin.account.notifications.account.help") }}</p>
        </div>
        <div v-if="query.isError.value && !settings" class="grid justify-items-start gap-2 rounded-lg border p-4 text-sm" role="alert">
          <p>{{ t("admin.account.notifications.loadError") }}</p>
          <Button type="button" variant="outline" size="sm" @click="query.refetch()">{{ t("admin.shell.retry") }}</Button>
        </div>
        <div v-else-if="!settings" class="grid gap-4" aria-busy="true" data-slot="loading">
          <Skeleton class="h-28 w-full rounded-xl" />
        </div>
        <form v-else class="grid gap-4" data-slot="your-account-form" novalidate @submit.prevent="submit">
          <Card v-for="channel in settings.channels" :key="channel.key" :data-slot="`channel-${channel.key}`" role="group" :aria-labelledby="`channel-${channel.key}-title`">
            <CardHeader>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <CardTitle :id="`channel-${channel.key}-title`" class="text-base">{{ t(`admin.account.notifications.channels.${channel.key}`) }}</CardTitle>
                <Badge :variant="stateOf(channel) === 'connected' ? 'secondary' : 'outline'" data-slot="channel-state">{{ badgeOf(channel) }}</Badge>
              </div>
              <CardDescription v-if="stateOf(channel) === 'unavailable'">{{ t("admin.account.notifications.unavailable") }}</CardDescription>
              <CardDescription v-else-if="stateOf(channel) === 'degraded'">{{ t("admin.account.notifications.degraded", { time: channel.since ? formatDateTime(channel.since, digits) : "" }) }}</CardDescription>
              <CardDescription v-else-if="stateOf(channel) === 'notConnected'">{{ t("admin.account.notifications.notConnected") }}</CardDescription>
            </CardHeader>
            <CardContent class="flex items-center justify-between gap-4">
              <Label :for="`channel-${channel.key}-switch`" class="text-sm">{{ t(`admin.account.notifications.send.${channel.key}`) }}</Label>
              <Switch :id="`channel-${channel.key}-switch`" v-model="enabled[channel.key]" :disabled="stateOf(channel) === 'unavailable' || save.isPending.value" />
            </CardContent>
            <CardContent v-if="channel.connectUrl">
              <Button as-child variant="outline">
                <a :href="channel.connectUrl" target="_blank" rel="noopener noreferrer">{{ t("admin.account.notifications.connect") }}</a>
              </Button>
            </CardContent>
          </Card>

          <Card data-slot="message-language" role="group" aria-labelledby="message-language-title">
            <CardHeader>
              <CardTitle id="message-language-title" class="text-base">{{ t("admin.account.notifications.language.title") }}</CardTitle>
              <CardDescription>{{ t("admin.account.notifications.language.help") }}</CardDescription>
            </CardHeader>
            <CardContent>
              <Select v-model="messageLocale" :disabled="save.isPending.value">
                <SelectTrigger class="w-48" :aria-label="t('admin.account.notifications.language.title')" data-slot="message-language-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in LOCALES" :key="option" :value="option">{{ t(`language.options.${option}.name`) }}</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div class="flex justify-end">
            <Button type="submit" data-slot="notification-settings-save" :disabled="!dirty || save.isPending.value">{{ save.isPending.value ? t("admin.account.notifications.saving") : t("admin.account.notifications.save") }}</Button>
          </div>
        </form>
      </section>

      <section class="grid gap-4" data-slot="this-device" aria-labelledby="this-device-title">
        <div class="grid gap-1">
          <h2 id="this-device-title" class="text-lg font-semibold">{{ t("admin.account.notifications.device.title") }}</h2>
          <p class="text-muted-foreground text-sm">{{ t("admin.account.notifications.device.help") }}</p>
        </div>
        <Card data-slot="device-sound" role="group" aria-labelledby="device-sound-title">
          <CardHeader>
            <CardTitle id="device-sound-title" class="text-base">{{ t("admin.account.notifications.device.sound.title") }}</CardTitle>
            <CardDescription>{{ t("admin.account.notifications.device.sound.help") }}</CardDescription>
          </CardHeader>
          <CardContent class="flex items-center justify-between gap-4">
            <Label for="device-sound-switch" class="text-sm">{{ t("admin.account.notifications.device.sound.label") }}</Label>
            <Switch id="device-sound-switch" v-model="sound" />
          </CardContent>
        </Card>
      </section>
    </div>
  </AdminPageHeader>
</template>
