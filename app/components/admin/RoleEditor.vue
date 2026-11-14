<script setup lang="ts">
import { toast } from "vue-sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_NAV_ICONS } from "~/components/admin/admin-nav-icons";
import RolePermissionEditor from "~/components/admin/RolePermissionEditor.vue";
import { useAdminBreadcrumbs } from "~/composables/admin/useAdminBreadcrumbs";
import { useAdminCan } from "~/composables/admin/useAdminCan";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { useAdminRole, useRoleMutations } from "~/composables/admin/useAdminRoles";
import { useUnsavedGuard } from "~/composables/admin/useUnsavedGuard";
import { permissionLabelKey } from "~~/shared/constants/permission-catalog";
import { PERMISSION_KEYS, type PermissionKey } from "~~/shared/constants/permissions";
import { ROLE_NAME_MAX, ROLE_NAME_MIN } from "~~/shared/schemas/admin-roles";
import { parseApiError, parseFieldErrors } from "~~/shared/utils/api-error-client";

// The Role page (.specs/users-and-roles/spec.md "Role page"): the name, the Permission editor and, for an existing
// Role, its members. The `super` Role is read-only with its note; a User who may only view Roles sees everything
// disabled. Saving a Role the User holds, when it would take access away from them, asks first and lists what they
// would lose; after a save the editor's own session refreshes. Leaving with unsaved edits asks first.
const props = defineProps<{ roleId?: string }>();

const { t, num, phone, localePath } = useAdminFormat();
const router = useRouter();
const sessionCache = useSessionCache();
const can = useAdminCan();
const canManage = computed(() => can("manage-roles"));

const id = computed(() => props.roleId);
const query = useAdminRole(id);
const role = computed(() => query.data.value);
const loadStatus = computed(() => (query.isError.value ? parseApiError(query.error.value).status : null));
const notFound = computed(() => loadStatus.value === 404);
const forbidden = computed(() => loadStatus.value === 403);
const isNew = computed(() => !props.roleId);
const isSuper = computed(() => Boolean(role.value?.isSuper));
const readOnly = computed(() => isSuper.value || !canManage.value);

// --- the editor state -----------------------------------------------------------------------------
const name = ref("");
const selected = ref<Set<PermissionKey>>(new Set());
const nameError = ref("");
const ready = computed(() => isNew.value || Boolean(role.value));
function reset() {
  name.value = role.value?.name ?? "";
  selected.value = new Set(role.value?.isSuper ? PERMISSION_KEYS : (role.value?.permissions ?? []));
  nameError.value = "";
}
reset();
watch(role, reset);

const displayName = computed(() => (isSuper.value ? t("admin.roles.superName") : name.value));
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((key) => b.has(key));
const dirty = computed(() => !readOnly.value && (name.value.trim() !== (role.value?.name ?? "") || !sameSet(selected.value, new Set(role.value?.permissions ?? []))));
const canSave = computed(() => !readOnly.value && (isNew.value ? name.value.trim().length > 0 : dirty.value));

// The leave guard: every way out asks while there are unsaved edits. A finished save or delete is not "unsaved".
const finished = ref(false);
const leaveGuard = useUnsavedGuard(computed(() => dirty.value && !finished.value));

// --- the breadcrumb --------------------------------------------------------------------------------
const breadcrumbs = useAdminBreadcrumbs();
watchEffect(() =>
  breadcrumbs.set([
    { labelKey: "admin.nav.groups.people" },
    { labelKey: "admin.nav.items.roles", to: localePath("/admin/roles") },
    { label: isNew.value ? t("admin.roles.newTitle") : displayName.value || t("admin.roles.loadingName") },
  ]),
);
onBeforeUnmount(() => breadcrumbs.set(null));
useHead({ title: () => (isNew.value ? t("admin.roles.newTitle") : `${displayName.value} · ${t("admin.nav.items.roles")}`) });

// --- saving ---------------------------------------------------------------------------------------
const { create, save, remove } = useRoleMutations();
const pending = computed(() => create.isPending.value || save.isPending.value);
const ownLossOpen = ref(false);
const ownLoss = computed(() => (role.value?.heldByYou ? role.value.exclusiveToYou.filter((key) => !selected.value.has(key)) : []));
const lossLabels = computed(() => ownLoss.value.map((key) => t(permissionLabelKey(key))));
const forbiddenAction = ref(false);

function validateName(): boolean {
  const length = name.value.trim().length;
  nameError.value = length < ROLE_NAME_MIN ? t("admin.roles.errors.nameShort", { min: num(ROLE_NAME_MIN) }) : length > ROLE_NAME_MAX ? t("admin.roles.errors.nameLong", { max: num(ROLE_NAME_MAX) }) : "";
  return nameError.value === "";
}
function startSave() {
  if (!canSave.value || !validateName()) return;
  if (ownLoss.value.length > 0) ownLossOpen.value = true;
  else void performSave();
}
async function performSave() {
  ownLossOpen.value = false;
  const body = { name: name.value.trim(), permissions: PERMISSION_KEYS.filter((key) => selected.value.has(key)) };
  try {
    if (role.value) await save.mutateAsync({ id: role.value.id, body: { ...body, expectedUpdatedAt: role.value.updatedAt } });
    else {
      const created = await create.mutateAsync(body);
      finished.value = true;
      toast.success(t("admin.roles.toast.created"));
      await sessionCache.invalidate();
      await router.replace(localePath(`/admin/roles/${created.id}`));
      return;
    }
    toast.success(t("admin.roles.toast.saved"));
    // Permissions apply on the next request; the editor's own menu updates at once.
    await sessionCache.invalidate();
  } catch (error) {
    const parsed = parseApiError(error);
    const fieldErrors = parseFieldErrors(error);
    if (parsed.code === "stale_version") {
      toast.error(t("admin.roles.toast.stale"));
      void query.refetch();
    } else if (fieldErrors.name?.[0] === "duplicate_name") nameError.value = t("admin.roles.errors.duplicateName");
    else if (fieldErrors.name?.length) nameError.value = t("admin.roles.errors.nameShort", { min: num(ROLE_NAME_MIN) });
    else if (parsed.code === "super_role_protected") toast.error(t("admin.roles.toast.superProtected"));
    else if (parsed.status === 403) forbiddenAction.value = true;
    else if (parsed.status !== 401) toast.error(t("admin.roles.toast.saveFailed"));
  }
}

// --- deleting -------------------------------------------------------------------------------------
const deleteOpen = ref(false);
const deleteBlocked = ref<number | null>(null);
async function performDelete() {
  if (!role.value) return;
  try {
    await remove.mutateAsync({ id: role.value.id, expectedUpdatedAt: role.value.updatedAt });
    finished.value = true;
    toast.success(t("admin.roles.toast.deleted"));
    await router.replace(localePath("/admin/roles"));
  } catch (error) {
    const parsed = parseApiError(error);
    if (parsed.code === "in_use") {
      deleteBlocked.value = (error as { data?: { data?: { memberCount?: number } } }).data?.data?.memberCount ?? role.value.memberCount;
      void query.refetch();
    } else if (parsed.code === "stale_version") {
      toast.error(t("admin.roles.toast.stale"));
      void query.refetch();
    } else if (parsed.status === 403) forbiddenAction.value = true;
    else if (parsed.status !== 401) toast.error(t("admin.roles.toast.deleteFailed"));
  }
}
const memberName = (member: { name: string | null }) => member.name ?? t("admin.roles.noName");
</script>

<template>
  <div class="flex flex-col gap-6">
    <div v-if="notFound" role="alert" class="grid justify-items-center gap-2 rounded-lg border p-10 text-center" data-slot="role-not-found">
      <h1 class="text-xl font-semibold">{{ t("admin.roles.notFound.title") }}</h1>
      <p class="text-muted-foreground text-sm">{{ t("admin.roles.notFound.description") }}</p>
      <Button as-child variant="outline" class="mt-2"><NuxtLink :to="localePath('/admin/roles')">{{ t("admin.roles.notFound.back") }}</NuxtLink></Button>
    </div>
    <AdminForbiddenAlert v-else-if="forbidden" />

    <template v-else>
      <AdminPageHeader :title="isNew ? t('admin.roles.newTitle') : displayName || t('admin.roles.loadingName')" :icon="ADMIN_NAV_ICONS.roles">
        <template v-if="isSuper" #after-title><Badge variant="secondary" data-slot="super-badge">{{ t("admin.roles.superBadge") }}</Badge></template>
      </AdminPageHeader>

      <div v-if="query.isError.value && !role && !isNew" role="alert" class="flex flex-col items-start gap-3 rounded-lg border p-4" data-slot="role-load-error">
        <p class="text-sm font-medium">{{ t("admin.roles.loadError") }}</p>
        <Button type="button" variant="outline" size="sm" @click="query.refetch()">{{ t("admin.shell.retry") }}</Button>
      </div>
      <div v-else-if="!ready" class="grid gap-4" data-slot="role-loading" aria-busy="true">
        <Skeleton class="h-9 w-72" />
        <Skeleton class="h-64 w-full" />
      </div>
      <form v-else class="grid gap-6" novalidate @submit.prevent="startSave">
        <p v-if="isSuper" class="bg-muted rounded-lg border p-3 text-sm" data-slot="super-note">{{ t("admin.roles.superNote") }}</p>
        <p v-else-if="!canManage" class="bg-muted rounded-lg border p-3 text-sm" data-slot="view-only-note">{{ t("admin.roles.viewOnly") }}</p>
        <AdminForbiddenAlert v-if="forbiddenAction" />

        <div class="grid max-w-md gap-1.5">
          <Label for="role-name">{{ t("admin.roles.fields.name") }}</Label>
          <Input
            id="role-name"
            :model-value="isSuper ? t('admin.roles.superName') : name"
            autocomplete="off"
            :maxlength="ROLE_NAME_MAX + 10"
            :disabled="readOnly"
            :aria-invalid="Boolean(nameError)"
            :aria-describedby="nameError ? 'role-name-error' : undefined"
            @update:model-value="
              (value: string | number) => {
                name = String(value);
                nameError = '';
              }
            "
          />
          <p v-if="nameError" id="role-name-error" class="text-destructive text-sm" role="alert">{{ nameError }}</p>
        </div>

        <RolePermissionEditor v-model="selected" :disabled="readOnly" />

        <section v-if="role" class="grid gap-2" data-slot="role-members">
          <h2 class="text-base font-semibold">{{ t("admin.roles.members.title") }}</h2>
          <p class="text-muted-foreground text-sm">{{ t("admin.roles.members.hint") }}</p>
          <p v-if="role.members.length === 0" class="text-muted-foreground rounded-lg border p-3 text-sm">{{ t("admin.roles.members.none") }}</p>
          <ul v-else class="divide-y rounded-lg border">
            <li v-for="member in role.members" :key="member.id" class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" data-slot="role-member">
              <NuxtLink :to="localePath(`/admin/users/${member.id}`)" class="font-medium hover:underline">{{ memberName(member) }}</NuxtLink>
              <span dir="ltr" class="text-muted-foreground">{{ phone(member.phoneE164) }}</span>
            </li>
          </ul>
        </section>

        <div v-if="deleteBlocked !== null" role="alert" class="text-destructive rounded-lg border border-current/30 p-3 text-sm" data-slot="delete-blocked">
          {{ t("admin.roles.deleteBlocked", { count: num(deleteBlocked) }, deleteBlocked) }}
        </div>

        <div v-if="!readOnly" class="flex flex-wrap items-center gap-2 border-t pt-4" data-slot="role-footer">
          <Button type="submit" :loading="pending" :disabled="!canSave">{{ t("admin.roles.save") }}</Button>
          <Button type="button" variant="outline" :disabled="!dirty || pending" @click="reset">{{ t("admin.roles.reset") }}</Button>
          <Button v-if="role" type="button" variant="outline" class="text-destructive ms-auto" :disabled="pending" @click="deleteOpen = true">{{ t("admin.roles.delete.button") }}</Button>
        </div>
      </form>
    </template>

    <AlertDialog v-model:open="ownLossOpen">
      <AlertDialogContent data-slot="own-access-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("admin.roles.ownAccess.title") }}</AlertDialogTitle>
          <AlertDialogDescription>{{ t("admin.roles.ownAccess.description") }}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul class="list-disc ps-5 text-sm" data-slot="own-access-list">
          <li v-for="label in lossLabels" :key="label">{{ label }}</li>
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("admin.roles.ownAccess.keep") }}</AlertDialogCancel>
          <AlertDialogAction variant="outline" class="text-destructive" @click="performSave">{{ t("admin.roles.ownAccess.saveAnyway") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("admin.roles.delete.title", { name: displayName }) }}</AlertDialogTitle>
          <AlertDialogDescription>{{ t("admin.roles.delete.description") }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("admin.roles.delete.cancel") }}</AlertDialogCancel>
          <AlertDialogAction variant="outline" class="text-destructive" @click="performDelete">{{ t("admin.roles.delete.confirm") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog v-model:open="leaveGuard.open.value">
      <AlertDialogContent data-slot="unsaved-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("admin.roles.unsaved.title") }}</AlertDialogTitle>
          <AlertDialogDescription>{{ t("admin.roles.unsaved.description") }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("admin.roles.unsaved.keep") }}</AlertDialogCancel>
          <AlertDialogAction variant="outline" class="text-destructive" @click="leaveGuard.answer(true)">{{ t("admin.roles.unsaved.discard") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
