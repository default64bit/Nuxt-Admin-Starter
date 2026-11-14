<script setup lang="ts">
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdminUserRoleChecklist from "~/components/admin/AdminUserRoleChecklist.vue";
import { useAdminRoleOptions } from "~/composables/admin/useAdminRoles";
import { useUserMutations } from "~/composables/admin/useAdminUsers";
import type { AdminUserPage } from "~~/shared/schemas/admin-users";
import { parseApiError } from "~~/shared/utils/api-error-client";

// Edit roles (.specs/users-and-roles/spec.md "Editing a User"): the whole set of Roles a User holds, at least one.
// The Default admin's `super` stays on. The dialog owns its mutation and reports `saved` or `stale` (the account
// changed underneath).
const props = defineProps<{ user: AdminUserPage }>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ saved: []; stale: [] }>();

const { t } = useI18n();
const { setRoles } = useUserMutations();
const roleOptions = useAdminRoleOptions();
const selected = ref<string[]>([]);
const problem = ref<"none" | "unknownRole" | null>(null);

// Each opening starts from the Roles the account holds now.
watch(open, (isOpen) => {
  if (!isOpen) return;
  selected.value = props.user.roles.map((role) => role.id);
  problem.value = null;
});
watch(selected, () => (problem.value = null));

const superLocked = computed(() => props.user.isDefaultAdmin && props.user.roles.some((role) => role.isSuper));

async function submit() {
  if (setRoles.isPending.value) return;
  if (selected.value.length === 0) {
    problem.value = "none";
    return;
  }
  try {
    await setRoles.mutateAsync({ id: props.user.id, body: { roleIds: selected.value, expectedUpdatedAt: props.user.updatedAt } });
    toast.success(t("admin.users.toast.rolesSaved"));
    emit("saved");
  } catch (error) {
    const parsed = parseApiError(error);
    if (parsed.code === "stale_version" || parsed.code === "not_found") emit("stale");
    else if (parsed.code === "validation_failed") {
      // A Role was deleted while the dialog was open.
      problem.value = "unknownRole";
      void roleOptions.refetch();
    } else if (parsed.status !== 401 && parsed.status !== 403) toast.error(t("admin.users.toast.failed"));
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-md" data-slot="user-roles-dialog">
      <DialogHeader>
        <DialogTitle>{{ t("admin.users.dialogs.roles.title") }}</DialogTitle>
        <DialogDescription>{{ t("admin.users.dialogs.roles.description") }}</DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" novalidate @submit.prevent="submit">
        <AdminUserRoleChecklist v-model="selected" :locked-super="superLocked" :invalid="problem !== null" describedby="user-roles-problem" />
        <p v-if="superLocked" class="text-muted-foreground text-sm">{{ t("admin.users.dialogs.roles.superLocked") }}</p>
        <p v-if="problem" id="user-roles-problem" role="alert" class="text-destructive text-sm" data-slot="roles-problem">{{ t(`admin.users.dialogs.roles.problems.${problem}`) }}</p>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="setRoles.isPending.value" @click="open = false">{{ t("admin.users.dialogs.cancel") }}</Button>
          <Button type="submit" :loading="setRoles.isPending.value">{{ t("admin.users.dialogs.roles.confirm") }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
