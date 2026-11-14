<script setup lang="ts">
import { IconPlus } from "@tabler/icons-vue";
import { useDebounceFn } from "@vueuse/core";
import { h, resolveComponent } from "vue";
import type { ColumnDef } from "@tanstack/vue-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableEmpty, type DataTableFeatures } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_NAV_ICONS } from "~/components/admin/admin-nav-icons";
import AdminSearchInput from "~/components/admin/AdminSearchInput.vue";
import AdminUserCreateDialog from "~/components/admin/AdminUserCreateDialog.vue";
import UsersStrip from "~/components/admin/UsersStrip.vue";
import { useAdminCan } from "~/composables/admin/useAdminCan";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useAdminRoleOptions } from "~/composables/admin/useAdminRoles";
import { useAdminUsersList } from "~/composables/admin/useAdminUsers";
import { USER_STATUSES } from "~~/shared/constants/database-enums";
import { ADMIN_PAGE_SIZE } from "~~/shared/schemas/admin-list";
import type { AdminUserRow } from "~~/shared/schemas/admin-users";
import { buildUserListUrlQuery, parseUserListUrl, type UserListState } from "~~/shared/utils/user-list-url";

// The Users list (.specs/users-and-roles/spec.md "Users list"): every account in a server-driven table with search,
// the Status and Role filters in the URL, and Previous/Next pages. A row opens the User page.
definePageMeta({ permission: "view-users" });

const { t, num, date, dateTime, phone, localePath } = useAdminFormat();
const route = useRoute();
const router = useRouter();
const can = useAdminCan();
useHead({ title: () => t("admin.nav.items.users") });
// Creating a User gives them Roles, so it needs both keys.
const canCreate = computed(() => can("create-users") && can("manage-roles"));

// The URL is the single source of the list state; every change replaces the history entry.
const state = computed(() => parseUserListUrl(route.query));
const hasFilters = computed(() => Boolean(state.value.q || state.value.status || state.value.role));
const replaceState = (next: UserListState) => router.replace({ query: buildUserListUrlQuery(next) });
const setState = (next: Partial<UserListState>) => replaceState({ ...state.value, page: 1, ...next });
const clearFilters = () => router.replace({ query: {} });

const searchText = ref(state.value.q ?? "");
watch(
  () => state.value.q,
  (value) => (searchText.value = value ?? ""),
);
const applySearch = useDebounceFn((value: string) => setState({ q: value.trim() || undefined }), 300);
watch(searchText, (value) => {
  if (value.trim() !== (state.value.q ?? "")) applySearch(value);
});

const list = useAdminUsersList(state);
const total = computed(() => list.data.value?.total ?? 0);
// A page past the end moves to the last page (the server answers 200 with no rows).
watch(
  () => list.data.value,
  (data) => {
    if (data && data.items.length === 0 && data.total > 0 && state.value.page > 1) replaceState({ ...state.value, page: Math.ceil(data.total / ADMIN_PAGE_SIZE) });
  },
);

const ALL = "all";
const roleOptions = useAdminRoleOptions();
const roleLabel = (role: { name: string; isSuper: boolean }) => (role.isSuper ? t("admin.roles.superName") : role.name);

const detailPath = (row: AdminUserRow) => localePath(`/admin/users/${row.id}`);
const newUserOpen = ref(false);
const userCreated = (userId: string) => {
  newUserOpen.value = false;
  return navigateTo(localePath(`/admin/users/${userId}`));
};

const NuxtLink = resolveComponent("NuxtLink");
const nameOf = (row: AdminUserRow) => [row.givenName, row.familyName].filter(Boolean).join(" ") || t("admin.users.noName");
const ROLES_SHOWN = 2;
const rolesCell = (row: AdminUserRow) => {
  const extra = row.roles.length - ROLES_SHOWN;
  return h("span", { class: "flex flex-wrap items-center gap-1" }, [
    ...row.roles.slice(0, ROLES_SHOWN).map((role) => h(Badge, { key: role.id, variant: role.isSuper ? "default" : "outline" }, () => roleLabel(role))),
    extra > 0 ? h("span", { class: "text-muted-foreground text-xs tabular-nums" }, t("admin.users.rolesMore", { count: num(extra) })) : null,
  ]);
};

const columns = computed<ColumnDef<DataTableFeatures, AdminUserRow>[]>(() => [
  {
    id: "name",
    header: t("admin.users.columns.name"),
    cell: ({ row }) =>
      h("span", { class: "flex flex-wrap items-center gap-2" }, [
        h(NuxtLink, { to: detailPath(row.original), class: "font-medium hover:underline", onClick: (event: Event) => event.stopPropagation() }, () => nameOf(row.original)),
        row.original.isSelf ? h(Badge, { variant: "outline" }, () => t("admin.users.you")) : null,
        row.original.isDefaultAdmin ? h(Badge, { variant: "outline" }, () => t("admin.users.defaultAdmin")) : null,
      ]),
  },
  { id: "phone", header: t("admin.users.columns.phone"), cell: ({ row }) => h("span", { dir: "ltr", class: "whitespace-nowrap" }, phone(row.original.phoneE164)) },
  { id: "roles", header: t("admin.users.columns.roles"), cell: ({ row }) => rolesCell(row.original) },
  {
    id: "status",
    header: t("admin.users.columns.status"),
    cell: ({ row }) => h(Badge, { variant: row.original.status === "disabled" ? "secondary" : "outline" }, () => t(`admin.users.statuses.${row.original.status}`)),
  },
  { id: "joined", header: t("admin.users.columns.joined"), cell: ({ row }) => h("span", { class: "whitespace-nowrap" }, date(row.original.createdAt)) },
  {
    id: "lastActive",
    header: t("admin.users.columns.lastActive"),
    cell: ({ row }) =>
      row.original.lastActiveAt ? h("span", { class: "whitespace-nowrap" }, dateTime(row.original.lastActiveAt)) : h("span", { class: "text-muted-foreground whitespace-nowrap" }, t("admin.users.neverSignedIn")),
  },
]);
</script>

<template>
  <div class="flex flex-col gap-4">
    <AdminPageHeader :title="t('admin.nav.items.users')" :icon="ADMIN_NAV_ICONS.users">
      <template v-if="canCreate" #actions>
        <Button type="button" data-slot="new-user" @click="newUserOpen = true"><IconPlus aria-hidden="true" />{{ t("admin.users.newButton") }}</Button>
      </template>
      <template #toolbar>
        <div class="flex w-full flex-wrap items-center gap-2" role="search">
          <AdminSearchInput v-model="searchText" class="max-w-xs min-w-48 flex-1" :aria-label="t('admin.users.searchLabel')" :placeholder="t('admin.users.searchPlaceholder')" />
          <Select :model-value="state.status ?? ALL" @update:model-value="(value) => setState({ status: value === ALL ? undefined : (String(value) as UserListState['status']) })">
            <SelectTrigger class="w-40" :aria-label="t('admin.users.filters.status')"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL">{{ t("admin.users.filters.allStatuses") }}</SelectItem>
              <SelectItem v-for="status in USER_STATUSES" :key="status" :value="status">{{ t(`admin.users.statuses.${status}`) }}</SelectItem>
            </SelectContent>
          </Select>
          <Select :model-value="state.role ?? ALL" @update:model-value="(value) => setState({ role: value === ALL ? undefined : String(value) })">
            <SelectTrigger class="w-48" :aria-label="t('admin.users.filters.role')"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL">{{ t("admin.users.filters.allRoles") }}</SelectItem>
              <SelectItem v-for="role in roleOptions.data.value?.items ?? []" :key="role.id" :value="role.id">{{ roleLabel(role) }}</SelectItem>
            </SelectContent>
          </Select>
          <Button v-if="hasFilters" type="button" variant="ghost" @click="clearFilters">{{ t("admin.users.clearFilters") }}</Button>
        </div>
      </template>
    </AdminPageHeader>

    <UsersStrip />

    <div v-if="list.isError.value && !list.data.value" role="alert" class="flex flex-col items-start gap-3 rounded-lg border p-4">
      <p class="text-sm font-medium">{{ t("admin.users.loadError") }}</p>
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
        @row-click="(row: AdminUserRow) => navigateTo(detailPath(row))"
        @update:page="(next: number) => replaceState({ ...state, page: next })"
      >
        <template #empty>
          <DataTableEmpty :title="t('admin.users.noResults.title')" :description="t('admin.users.noResults.description')">
            <Button v-if="hasFilters" type="button" variant="outline" @click="clearFilters">{{ t("admin.users.clearFilters") }}</Button>
          </DataTableEmpty>
        </template>
      </DataTable>
    </div>

    <AdminUserCreateDialog v-if="canCreate" v-model:open="newUserOpen" @created="userCreated" />
  </div>
</template>
