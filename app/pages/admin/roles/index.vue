<script setup lang="ts">
import { IconPlus } from "@tabler/icons-vue";
import { useDebounceFn } from "@vueuse/core";
import { h, resolveComponent } from "vue";
import type { ColumnDef } from "@tanstack/vue-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableEmpty, type DataTableFeatures } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_NAV_ICONS } from "~/components/admin/admin-nav-icons";
import AdminSearchInput from "~/components/admin/AdminSearchInput.vue";
import { useAdminCan } from "~/composables/admin/useAdminCan";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useAdminRolesList } from "~/composables/admin/useAdminRoles";
import { PERMISSION_KEYS } from "~~/shared/constants/permissions";
import { ADMIN_PAGE_SIZE } from "~~/shared/schemas/admin-list";
import type { AdminRoleRow } from "~~/shared/schemas/admin-roles";
import { buildRoleListUrlQuery, parseRoleListUrl, type RoleListState } from "~~/shared/utils/role-list-url";

// The Roles list (.specs/users-and-roles/spec.md "Roles list"): the `super` Role first, then by name, with the
// Permission and member counts. A row opens the Role page.
definePageMeta({ permission: "view-roles" });

const { t, num, date, localePath } = useAdminFormat();
const route = useRoute();
const router = useRouter();
const can = useAdminCan();
useHead({ title: () => t("admin.nav.items.roles") });

const state = computed(() => parseRoleListUrl(route.query));
const hasFilters = computed(() => Boolean(state.value.q));
const setState = (next: Partial<RoleListState>) => router.replace({ query: buildRoleListUrlQuery({ ...state.value, page: 1, ...next }) });
const searchText = ref(state.value.q ?? "");
watch(
  () => state.value.q,
  (value) => (searchText.value = value ?? ""),
);
const applySearch = useDebounceFn((value: string) => setState({ q: value.trim() || undefined }), 300);
watch(searchText, (value) => {
  if (value.trim() !== (state.value.q ?? "")) applySearch(value);
});

const list = useAdminRolesList(state);
const total = computed(() => list.data.value?.total ?? 0);
watch(
  () => list.data.value,
  (data) => {
    if (data && data.items.length === 0 && data.total > 0 && state.value.page > 1) router.replace({ query: buildRoleListUrlQuery({ ...state.value, page: Math.ceil(data.total / ADMIN_PAGE_SIZE) }) });
  },
);

const NuxtLink = resolveComponent("NuxtLink");
const detailPath = (role: AdminRoleRow) => localePath(`/admin/roles/${role.id}`);
const permissionsOf = (role: AdminRoleRow) => t("admin.roles.editor.countOf", { on: num(role.isSuper ? PERMISSION_KEYS.length : role.permissionCount), total: num(PERMISSION_KEYS.length) });
const nameOf = (role: AdminRoleRow) => (role.isSuper ? t("admin.roles.superName") : role.name);

const columns = computed<ColumnDef<DataTableFeatures, AdminRoleRow>[]>(() => [
  {
    id: "name",
    header: t("admin.roles.columns.name"),
    cell: ({ row }) =>
      h("div", { class: "flex flex-wrap items-center gap-2" }, [
        h(NuxtLink, { to: detailPath(row.original), class: "font-medium hover:underline", onClick: (event: Event) => event.stopPropagation() }, () => nameOf(row.original)),
        row.original.isSuper ? h(Badge, { variant: "secondary" }, () => t("admin.roles.superBadge")) : null,
      ]),
  },
  {
    id: "permissions",
    header: t("admin.roles.columns.permissions"),
    cell: ({ row }) => h("span", { class: "tabular-nums whitespace-nowrap" }, permissionsOf(row.original)),
  },
  { id: "members", header: t("admin.roles.columns.members"), cell: ({ row }) => h("span", { class: "tabular-nums" }, num(row.original.memberCount)) },
  { id: "updated", header: t("admin.roles.columns.updated"), cell: ({ row }) => date(row.original.updatedAt) },
]);
</script>

<template>
  <div class="flex flex-col gap-4">
    <AdminPageHeader :title="t('admin.nav.items.roles')" :icon="ADMIN_NAV_ICONS.roles">
      <template v-if="can('manage-roles')" #actions>
        <Button as-child
          ><NuxtLink :to="localePath('/admin/roles/new')" data-slot="new-role"><IconPlus aria-hidden="true" />{{ t("admin.roles.newButton") }}</NuxtLink></Button
        >
      </template>
      <template #toolbar>
        <div class="flex w-full flex-wrap items-center gap-2" role="search">
          <AdminSearchInput v-model="searchText" class="max-w-xs min-w-48 flex-1" :aria-label="t('admin.roles.searchLabel')" :placeholder="t('admin.roles.searchPlaceholder')" />
          <Button v-if="hasFilters" type="button" variant="ghost" @click="router.replace({ query: {} })">{{ t("admin.roles.clearFilters") }}</Button>
        </div>
      </template>
    </AdminPageHeader>

    <div v-if="list.isError.value && !list.data.value" role="alert" class="flex flex-col items-start gap-3 rounded-lg border p-4">
      <p class="text-sm font-medium">{{ t("admin.roles.listError") }}</p>
      <Button type="button" variant="outline" size="sm" @click="list.refetch()">{{ t("admin.shell.retry") }}</Button>
    </div>
    <div v-else-if="list.isPending.value" class="grid gap-2" data-slot="list-loading" aria-busy="true">
      <Skeleton v-for="n in 5" :key="n" class="h-14 w-full" />
    </div>
    <div v-else class="overflow-x-auto" :class="list.isPlaceholderData.value ? 'opacity-60' : undefined">
      <DataTable
        :columns="columns"
        :data="list.data.value?.items ?? []"
        :row-count="total"
        :page-size="ADMIN_PAGE_SIZE"
        :page="state.page"
        clickable-rows
        @row-click="(role: AdminRoleRow) => navigateTo(detailPath(role))"
        @update:page="(next: number) => router.replace({ query: buildRoleListUrlQuery({ ...state, page: next }) })"
      >
        <template #empty>
          <DataTableEmpty :title="t('admin.roles.noResults.title')" :description="t('admin.roles.noResults.description')">
            <Button type="button" variant="outline" @click="router.replace({ query: {} })">{{ t("admin.roles.clearFilters") }}</Button>
          </DataTableEmpty>
        </template>
      </DataTable>
    </div>
  </div>
</template>
