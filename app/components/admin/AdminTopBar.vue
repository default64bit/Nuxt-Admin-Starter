<script setup lang="ts">
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAdminBreadcrumbs } from "~/composables/admin/useAdminBreadcrumbs";
import { useAdminNav } from "~/composables/admin/useAdminNav";
import { resolveCrumbs } from "~~/shared/utils/admin-breadcrumbs";
import { navCrumbKeys } from "~~/shared/utils/admin-nav";

// Sidebar trigger, breadcrumb, the Inbox bell mount point and the user menu (which holds the language and theme
// switches). No search.
const { t } = useI18n();
const { override } = useAdminBreadcrumbs();
const { current } = useAdminNav();
// Default crumbs come from the nav config ("Group > Item"; the Dashboard is one crumb); a deeper page replaces
// them through `useAdminBreadcrumbs`.
const crumbs = computed(() =>
  resolveCrumbs(override.value, (current.value ? navCrumbKeys(current.value) : ["admin.nav.items.dashboard"]).map((key) => ({ label: t(key) }))),
);
</script>

<template>
  <header data-slot="admin-top-bar" class="bg-background sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4">
    <SidebarTrigger :aria-label="t('admin.shell.toggleSidebar')" />
    <Separator orientation="vertical" class="mx-1 my-auto h-5" />
    <Breadcrumb class="min-w-0 flex-1">
      <BreadcrumbList class="opacity-100">
        <template v-for="(crumb, index) in crumbs" :key="`${crumb.label}-${index}`">
          <BreadcrumbItem>
            <BreadcrumbPage v-if="index === crumbs.length - 1">{{ crumb.label }}</BreadcrumbPage>
            <BreadcrumbLink v-else-if="crumb.to" as-child><NuxtLink :to="crumb.to">{{ crumb.label }}</NuxtLink></BreadcrumbLink>
            <span v-else>{{ crumb.label }}</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator v-if="index < crumbs.length - 1" />
        </template>
      </BreadcrumbList>
    </Breadcrumb>
    <AdminInboxBell />
    <AdminUserMenu />
  </header>
</template>
