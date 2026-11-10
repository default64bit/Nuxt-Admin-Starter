<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAdminLiveAlerts } from "~/composables/admin/useAdminLiveAlerts";

// The admin shell on the default shadcn look. The sidebar state lives in the `sidebar_state` cookie, read during SSR
// (admin pages are never cached). A page that throws shows an inline alert with Retry while the sidebar and top bar
// stay usable.
const { t } = useI18n();
// Live Inbox alerts (toast, bell ring, chime) for new items found by the nav-counts poll.
useAdminLiveAlerts();

// The tab title is "Page · App name"; the app name comes from the per-locale messages.
// A getter, so the head re-renders when the locale changes.
useHead(() => {
  const appName = t("app.name");
  return { titleTemplate: (page?: string) => (page ? `${page} · ${appName}` : appName) };
});
</script>

<template>
  <SidebarProvider class="bg-background text-foreground">
    <AdminSidebar />
    <SidebarInset>
      <AdminTopBar />
      <AdminPushBanner />
      <!-- SidebarInset already renders the page's <main>; this is its focus target. -->
      <div id="admin-main" tabindex="-1" class="flex-1 p-4 outline-none md:p-6">
        <NuxtErrorBoundary>
          <slot />
          <template #error="{ clearError }">
            <div role="alert" class="flex flex-col items-start gap-3 rounded-lg border p-4">
              <p class="text-sm font-medium">{{ t("admin.shell.pageError") }}</p>
              <Button data-slot="admin-retry" variant="outline" size="sm" @click="clearError()">{{ t("admin.shell.retry") }}</Button>
            </div>
          </template>
        </NuxtErrorBoundary>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
