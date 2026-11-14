<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminInstall } from "~/composables/admin/useAdminInstall";

// "Install" in the This device section: the button after `beforeinstallprompt`, else the address-bar hint, "Installed
// app" when running standalone, and nothing on iOS or where the browser cannot install the app.
const { t } = useI18n();
const install = useAdminInstall();
</script>

<template>
  <Card v-if="install.state.value !== 'hidden'" data-slot="device-install" :data-state="install.state.value" role="group" aria-labelledby="device-install-title">
    <CardHeader>
      <CardTitle id="device-install-title" class="text-base">{{ t("admin.account.notifications.device.install.title") }}</CardTitle>
      <CardDescription>{{ t("admin.account.notifications.device.install.help", { appName: t("app.name") }) }}</CardDescription>
    </CardHeader>
    <CardContent class="flex items-center gap-4">
      <Button v-if="install.state.value === 'prompt'" data-slot="device-install-button" type="button" @click="install.install()">{{ t("admin.account.notifications.device.install.button", { appName: t("app.name") }) }}</Button>
      <p v-else-if="install.state.value === 'installed'" data-slot="device-install-installed" class="text-sm font-medium">{{ t("admin.account.notifications.device.install.installed") }}</p>
      <p v-else data-slot="device-install-hint" class="text-muted-foreground text-sm">{{ t("admin.account.notifications.device.install.hint") }}</p>
    </CardContent>
  </Card>
</template>
