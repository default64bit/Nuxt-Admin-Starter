<script setup lang="ts">
import { toast } from "vue-sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminPush, type SendTestResult, type TurnOnResult } from "~/composables/admin/useAdminPush";
import { formatDateTime } from "~~/shared/utils/format-date";

// "Browser push" in the This device section: this browser's push
// on a computer, immediate, outside the Save form. Not configured: nothing is rendered. Blocked, iOS not
// installed and unsupported replace the buttons with an explanation.
const { t, locale } = useI18n();
const push = useAdminPush();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const busy = ref<"on" | "off" | "test" | null>(null);
const degradedSince = computed(() => (push.channel.value?.availability === "degraded" && push.channel.value.since ? formatDateTime(push.channel.value.since, digits.value) : ""));

async function onTurnOn() {
  if (busy.value) return;
  busy.value = "on";
  const result: TurnOnResult = await push.turnOn();
  busy.value = null;
  if (result === "on") toast.success(t("admin.account.notifications.device.push.toast.on"));
  else if (result === "dismissed") toast.info(t("admin.account.notifications.device.push.toast.dismissed"));
  else if (result === "failed") toast.error(t("admin.account.notifications.device.push.toast.onFailed"));
}

async function onTurnOff() {
  if (busy.value) return;
  busy.value = "off";
  const ok = await push.turnOff();
  busy.value = null;
  if (ok) toast.success(t("admin.account.notifications.device.push.toast.off"));
  else toast.error(t("admin.account.notifications.device.push.toast.offFailed"));
}

async function onTest() {
  if (busy.value) return;
  busy.value = "test";
  const result: SendTestResult = await push.sendTest();
  busy.value = null;
  const key = { sent: "testSent", rejected: "testRejected", unavailable: "testUnavailable", rate_limited: "testRateLimited", failed: "testFailed" }[result];
  const show = result === "sent" ? toast.success : toast.error;
  show(t(`admin.account.notifications.device.push.toast.${key}`));
}
</script>

<template>
  <Card v-if="push.state.value !== 'hidden'" data-slot="device-push" :data-state="push.state.value" role="group" aria-labelledby="device-push-title">
    <CardHeader>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="device-push-title" class="text-base">{{ t("admin.account.notifications.device.push.title") }}</CardTitle>
        <Badge v-if="push.state.value === 'on' || push.state.value === 'off'" :variant="push.state.value === 'on' ? 'secondary' : 'outline'" data-slot="device-push-badge">
          {{ push.state.value === "on" ? t("admin.account.notifications.device.push.on") : t("admin.account.notifications.device.push.off") }}
        </Badge>
      </div>
      <CardDescription>{{ t("admin.account.notifications.device.push.help") }}</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-3">
      <p v-if="degradedSince" class="text-muted-foreground text-sm" data-slot="device-push-degraded">{{ t("admin.account.notifications.device.push.degraded", { time: degradedSince }) }}</p>

      <div v-if="push.state.value === 'denied'" class="grid gap-1 text-sm" data-slot="device-push-denied">
        <p class="font-medium">{{ t("admin.account.notifications.device.push.denied") }}</p>
        <p class="text-muted-foreground">{{ t("admin.account.notifications.device.push.deniedHelp") }}</p>
      </div>
      <div v-else-if="push.state.value === 'ios-not-installed'" class="grid gap-1 text-sm" data-slot="device-push-ios">
        <p class="font-medium">{{ t("admin.account.notifications.device.push.ios", { appName: t("app.name") }) }}</p>
        <p class="text-muted-foreground">{{ t("admin.account.notifications.device.push.iosHelp") }}</p>
      </div>
      <div v-else-if="push.state.value === 'unsupported'" class="grid gap-1 text-sm" data-slot="device-push-unsupported">
        <p class="font-medium">{{ t("admin.account.notifications.device.push.unsupported") }}</p>
        <p class="text-muted-foreground">{{ t("admin.account.notifications.device.push.unsupportedHelp") }}</p>
      </div>
      <div v-else-if="push.state.value === 'off'" class="flex flex-wrap items-center gap-2">
        <Button type="button" data-slot="device-push-on" :disabled="busy !== null" @click="onTurnOn">{{ t("admin.account.notifications.device.push.turnOn") }}</Button>
      </div>
      <div v-else class="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" data-slot="device-push-test" :disabled="busy !== null" @click="onTest">{{ t("admin.account.notifications.device.push.test") }}</Button>
        <Button type="button" variant="outline" data-slot="device-push-off" :disabled="busy !== null" @click="onTurnOff">{{ t("admin.account.notifications.device.push.turnOff") }}</Button>
      </div>
    </CardContent>
  </Card>
</template>
