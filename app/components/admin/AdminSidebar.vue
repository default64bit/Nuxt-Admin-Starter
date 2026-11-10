<script setup lang="ts">
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAdminNav } from "~/composables/admin/useAdminNav";
import { ADMIN_NAV_ICONS } from "./admin-nav-icons";

// The menu is the typed config filtered by the User's Permissions and by which pages exist. Groups with no visible
// item are not rendered (no empty headings), so a User holding no page Permission sees the Dashboard only.
const { t } = useI18n();
const { groups, current, hrefFor } = useAdminNav();
const appName = computed(() => t("app.name"));
const monogram = computed(() => Array.from(appName.value)[0] ?? "");
</script>

<template>
  <Sidebar side="start" collapsible="icon">
    <nav :aria-label="t('admin.shell.menu')" class="flex min-h-0 flex-1 flex-col">
      <SidebarHeader class="flex flex-row items-center gap-2 p-2">
        <!-- The neutral text logo: the per-locale app name, so a Project brands it by editing the messages. -->
        <span aria-hidden="true" class="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold">{{ monogram }}</span>
        <NuxtLink :to="hrefFor({ path: '/admin' })" class="truncate text-lg font-semibold group-data-[collapsible=icon]:hidden">{{ appName }}</NuxtLink>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup v-for="group in groups" :key="group.group">
          <SidebarGroupLabel v-if="group.group !== 'dashboard'">{{ t(`admin.nav.groups.${group.group}`) }}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem v-for="item in group.items" :key="item.key">
                <SidebarMenuButton as-child :is-active="current?.key === item.key" :tooltip="t(item.labelKey)">
                  <NuxtLink :to="hrefFor(item)" :aria-current="current?.key === item.key ? 'page' : undefined">
                    <component :is="ADMIN_NAV_ICONS[item.key]" class="ms-0.5" aria-hidden="true" />
                    <span>{{ t(item.labelKey) }}</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </nav>
  </Sidebar>
</template>
