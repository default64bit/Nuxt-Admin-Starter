<script setup lang="ts">
import { toast } from "vue-sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_NAV_ICONS } from "~/components/admin/admin-nav-icons";
import AdminUserNamesDialog from "~/components/admin/AdminUserNamesDialog.vue";
import AdminUserRolesDialog from "~/components/admin/AdminUserRolesDialog.vue";
import { useAdminBreadcrumbs } from "~/composables/admin/useAdminBreadcrumbs";
import { useAdminCan } from "~/composables/admin/useAdminCan";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useAdminUser, useUserMutations } from "~/composables/admin/useAdminUsers";
import { parseApiError } from "~~/shared/utils/api-error-client";

// One account (.specs/users-and-roles/spec.md "User page"): the header with its badges and actions, the Account and
// Access cards. Every action is a dialog; after success a toast shows and the page refetches. The actions the rules
// forbid are not rendered (own account, `super` without a super viewer, the Default admin); the server enforces
// them again. A `409 stale_version` says the account changed underneath: the page reloads it.
definePageMeta({ permission: "view-users" });

const { t, num, date, dateTime, phone, localePath } = useAdminFormat();
const route = useRoute();
const can = useAdminCan();

const id = computed(() => String(route.params.id));
const query = useAdminUser(id);
const user = computed(() => query.data.value);
const notFound = computed(() => query.isError.value && parseApiError(query.error.value).status === 404);
const forbidden = computed(() => query.isError.value && parseApiError(query.error.value).status === 403);

const nameOf = (value: { givenName: string | null; familyName: string | null }) => [value.givenName, value.familyName].filter(Boolean).join(" ") || t("admin.users.noName");
const displayName = computed(() => (user.value ? nameOf(user.value) : ""));
const roleLabel = (role: { name: string; isSuper: boolean }) => (role.isSuper ? t("admin.roles.superName") : role.name);

// --- what this User may do here ------------------------------------------------------------------
const holdsSuper = computed(() => Boolean(user.value?.roles.some((role) => role.isSuper)));
// Never on oneself, and an account holding `super` needs a super viewer; both are re-checked by the server.
const mayAct = computed(() => Boolean(user.value && !user.value.isSelf && (user.value.viewerIsSuper || !holdsSuper.value)));
const canEditRoles = computed(() => mayAct.value && can("edit-users") && can("manage-roles"));
const canDisable = computed(() => mayAct.value && can("disable-users") && !user.value!.isDefaultAdmin && user.value!.status === "active");
const canEnable = computed(() => mayAct.value && can("disable-users") && !user.value!.isDefaultAdmin && user.value!.status === "disabled");

// --- the breadcrumb --------------------------------------------------------------------------------
const breadcrumbs = useAdminBreadcrumbs();
watchEffect(() =>
  breadcrumbs.set([
    { labelKey: "admin.nav.groups.people" },
    { labelKey: "admin.nav.items.users", to: localePath("/admin/users") },
    { label: displayName.value || t("admin.users.detail.loadingName") },
  ]),
);
onBeforeUnmount(() => breadcrumbs.set(null));
useHead({ title: () => (displayName.value ? `${displayName.value} · ${t("admin.nav.items.users")}` : t("admin.nav.items.users")) });

// --- dialogs -------------------------------------------------------------------------------------
const namesOpen = ref(false);
const rolesOpen = ref(false);
// What was asked stays after the dialog closes: the confirm's own close runs before its handler reads it.
const statusAction = ref<"disable" | "enable">("disable");
const statusOpen = ref(false);
const askStatus = (action: "disable" | "enable") => {
  statusAction.value = action;
  statusOpen.value = true;
};
const { disable, enable } = useUserMutations();
const forbiddenAction = ref(false);

/** The account changed underneath the open dialog: say so, close it and show the account as it is now. */
function stale() {
  namesOpen.value = rolesOpen.value = false;
  statusOpen.value = false;
  toast.error(t("admin.users.toast.stale"));
  void query.refetch();
}
const refreshed = () => {
  namesOpen.value = rolesOpen.value = false;
};

async function confirmStatus() {
  const action = statusAction.value;
  if (!user.value) return;
  try {
    await { disable, enable }[action].mutateAsync({ id: id.value, body: { expectedUpdatedAt: user.value.updatedAt } });
    toast.success(t(action === "disable" ? "admin.users.toast.disabled" : "admin.users.toast.enabled"));
    statusOpen.value = false;
  } catch (error) {
    const parsed = parseApiError(error);
    statusOpen.value = false;
    if (parsed.code === "stale_version" || parsed.code === "invalid_transition") stale();
    else if (parsed.code === "default_admin_protected") {
      toast.error(t("admin.users.toast.defaultAdminProtected"));
      void query.refetch();
    } else if (parsed.status === 403) {
      // A changed Role of the person or of the viewer: show the account fresh.
      forbiddenAction.value = true;
      void query.refetch();
    } else if (parsed.status !== 401) toast.error(t("admin.users.toast.failed"));
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div v-if="notFound" role="alert" class="grid justify-items-center gap-2 rounded-lg border p-10 text-center" data-slot="user-not-found">
      <h1 class="text-xl font-semibold">{{ t("admin.users.detail.notFound.title") }}</h1>
      <p class="text-muted-foreground text-sm">{{ t("admin.users.detail.notFound.description") }}</p>
      <Button as-child variant="outline" class="mt-2"><NuxtLink :to="localePath('/admin/users')">{{ t("admin.users.detail.notFound.back") }}</NuxtLink></Button>
    </div>
    <AdminForbiddenAlert v-else-if="forbidden" />

    <template v-else>
      <AdminPageHeader :title="displayName || t('admin.users.detail.loadingName')" :icon="ADMIN_NAV_ICONS.users">
        <template v-if="user" #actions>
          <Button v-if="can('edit-users')" type="button" variant="outline" data-slot="edit-names" @click="namesOpen = true">{{ t("admin.users.actions.editNames") }}</Button>
          <Button v-if="canDisable" type="button" variant="outline" class="text-destructive" data-slot="disable-user" @click="askStatus('disable')">{{ t("admin.users.actions.disable") }}</Button>
          <Button v-if="canEnable" type="button" data-slot="enable-user" @click="askStatus('enable')">{{ t("admin.users.actions.enable") }}</Button>
        </template>
        <template v-if="user" #toolbar>
          <div class="flex flex-wrap items-center gap-2 text-sm" data-slot="user-badges">
            <span dir="ltr">{{ phone(user.phoneE164) }}</span>
            <Badge v-if="user.isDefaultAdmin" variant="outline">{{ t("admin.users.defaultAdmin") }}</Badge>
            <Badge v-if="user.status === 'disabled'" variant="secondary">{{ t("admin.users.statuses.disabled") }}</Badge>
            <Badge v-if="user.isSelf" variant="outline">{{ t("admin.users.you") }}</Badge>
          </div>
        </template>
      </AdminPageHeader>

      <AdminForbiddenAlert v-if="forbiddenAction" />
      <div v-if="query.isError.value && !user" role="alert" class="flex flex-col items-start gap-3 rounded-lg border p-4" data-slot="user-load-error">
        <p class="text-sm font-medium">{{ t("admin.users.detail.loadError") }}</p>
        <Button type="button" variant="outline" size="sm" @click="query.refetch()">{{ t("admin.shell.retry") }}</Button>
      </div>
      <div v-else-if="!user" class="grid gap-4 lg:grid-cols-2" data-slot="user-loading" aria-busy="true">
        <Skeleton class="h-56 w-full" />
        <Skeleton class="h-56 w-full" />
      </div>
      <template v-else>
        <div class="grid items-start gap-4 lg:grid-cols-2" :class="query.isFetching.value ? 'opacity-80' : undefined">
          <Card data-slot="account-card">
            <CardHeader
              ><CardTitle
                ><h2>{{ t("admin.users.detail.account.title") }}</h2></CardTitle
              ></CardHeader
            >
            <CardContent>
              <dl class="grid gap-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
                <dt class="text-muted-foreground">{{ t("admin.users.fields.givenName") }}</dt>
                <dd data-slot="given-name">{{ user.givenName ?? "—" }}</dd>
                <dt class="text-muted-foreground">{{ t("admin.users.fields.familyName") }}</dt>
                <dd data-slot="family-name">{{ user.familyName ?? "—" }}</dd>
                <dt class="text-muted-foreground">{{ t("admin.users.fields.phone") }}</dt>
                <dd dir="ltr" class="justify-self-start">{{ phone(user.phoneE164) }}</dd>
                <dt class="text-muted-foreground">{{ t("admin.users.columns.status") }}</dt>
                <dd data-slot="user-status">{{ t(`admin.users.statuses.${user.status}`) }}</dd>
                <dt class="text-muted-foreground">{{ t("admin.users.columns.joined") }}</dt>
                <dd>{{ date(user.createdAt) }}</dd>
                <dt class="text-muted-foreground">{{ t("admin.users.columns.lastActive") }}</dt>
                <dd>{{ user.lastActiveAt ? dateTime(user.lastActiveAt) : t("admin.users.neverSignedIn") }}</dd>
                <dt class="text-muted-foreground">{{ t("admin.users.detail.account.sessions") }}</dt>
                <dd data-slot="active-sessions">{{ num(user.activeSessionCount) }}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card data-slot="access-card">
            <CardHeader
              ><CardTitle
                ><h2>{{ t("admin.users.detail.access.title") }}</h2></CardTitle
              ></CardHeader
            >
            <CardContent class="grid gap-4">
              <ul class="flex flex-wrap gap-2" data-slot="roles">
                <li v-for="role in user.roles" :key="role.id">
                  <Badge :variant="role.isSuper ? 'default' : 'outline'">{{ roleLabel(role) }}</Badge>
                </li>
              </ul>
              <div v-if="canEditRoles">
                <Button type="button" variant="outline" data-slot="edit-roles" @click="rolesOpen = true">{{ t("admin.users.actions.editRoles") }}</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <AdminUserNamesDialog v-model:open="namesOpen" :user="user" @saved="refreshed" @stale="stale" />
        <AdminUserRolesDialog v-if="canEditRoles" v-model:open="rolesOpen" :user="user" @saved="refreshed" @stale="stale" />
      </template>
    </template>

    <AlertDialog v-model:open="statusOpen">
      <AlertDialogContent data-slot="user-status-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t(`admin.users.dialogs.${statusAction}.title`, { name: displayName }) }}</AlertDialogTitle>
          <AlertDialogDescription>{{ t(`admin.users.dialogs.${statusAction}.description`) }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("admin.users.dialogs.cancel") }}</AlertDialogCancel>
          <AlertDialogAction :variant="statusAction === 'disable' ? 'outline' : 'default'" :class="statusAction === 'disable' ? 'text-destructive' : undefined" @click="confirmStatus">
            {{ t(`admin.users.dialogs.${statusAction}.confirm`) }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
