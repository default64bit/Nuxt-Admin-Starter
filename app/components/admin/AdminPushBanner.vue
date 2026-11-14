<script setup lang="ts">
import { IconBellRinging } from "@tabler/icons-vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { useAdminPush } from "~/composables/admin/useAdminPush";

// The one-time turn-on invitation below the top bar. The push composable decides when it shows; "Not now" is remembered in this browser, and it never returns
// once permission is granted or denied (asking for permission also dismisses it).
const { t } = useI18n();
const push = useAdminPush();
const busy = ref(false);

async function onTurnOn() {
  if (busy.value) return;
  busy.value = true;
  const result = await push.turnOn();
  busy.value = false;
  if (result === "on") toast.success(t("admin.account.notifications.device.push.toast.on"));
  else if (result === "dismissed") toast.info(t("admin.account.notifications.device.push.toast.dismissed"));
  else if (result === "failed") toast.error(t("admin.account.notifications.device.push.toast.onFailed"));
}
</script>

<template>
  <section v-if="push.bannerVisible.value" data-slot="admin-push-banner" class="bg-muted/50 mx-6 mt-4 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm" role="region" :aria-label="t('admin.shell.pushBanner.label')">
    <IconBellRinging aria-hidden="true" class="size-5 shrink-0" />
    <p class="min-w-0 flex-1">{{ t("admin.shell.pushBanner.message") }}</p>
    <div class="flex items-center gap-2">
      <Button type="button" size="sm" data-slot="admin-push-banner-on" :disabled="busy" @click="onTurnOn">{{ t("admin.shell.pushBanner.turnOn") }}</Button>
      <Button type="button" size="sm" variant="ghost" data-slot="admin-push-banner-dismiss" :disabled="busy" @click="push.dismissBanner()">{{ t("admin.shell.pushBanner.notNow") }}</Button>
    </div>
  </section>
</template>
