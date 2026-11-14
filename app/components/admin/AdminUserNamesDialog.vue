<script setup lang="ts">
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserMutations } from "~/composables/admin/useAdminUsers";
import { fieldErrorsFromServer, validateNames, type NameErrorKey, type NameErrors, type NameField, type NameValues } from "~~/shared/utils/account-form";
import { parseApiError, parseFieldErrors } from "~~/shared/utils/api-error-client";

// Edit names (.specs/users-and-roles/spec.md "Editing a User"): both names with the My account rules, on any
// account. The phone is not editable here. The dialog owns its mutation and reports `saved` or `stale`; a failed
// request keeps what was typed.
const props = defineProps<{ user: { id: string; givenName: string | null; familyName: string | null; updatedAt: string } }>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ saved: []; stale: [] }>();

const { t } = useI18n();
const { rename } = useUserMutations();
const values = reactive<NameValues>({ givenName: "", familyName: "" });
const errors = ref<NameErrors>({});

// Each opening starts from the saved names with no leftover errors.
watch(open, (isOpen) => {
  if (!isOpen) return;
  values.givenName = props.user.givenName ?? "";
  values.familyName = props.user.familyName ?? "";
  errors.value = {};
});

const MESSAGE: Record<NameErrorKey, string> = { required: "required", too_long: "tooLong", control_characters: "controlCharacters", invalid: "invalid" };
const FIELDS: NameField[] = ["givenName", "familyName"];
const messageOf = (field: NameField) => (errors.value[field] ? t(`admin.users.errors.${MESSAGE[errors.value[field]!]}`) : undefined);
const edit = (field: NameField, value: string | number) => {
  values[field] = String(value);
  errors.value = { ...errors.value, [field]: undefined };
};

async function submit() {
  if (rename.isPending.value) return;
  const checked = validateNames(values);
  if (!checked.ok) {
    errors.value = checked.errors;
    return;
  }
  try {
    await rename.mutateAsync({ id: props.user.id, body: { ...checked.values, expectedUpdatedAt: props.user.updatedAt } });
    toast.success(t("admin.users.toast.namesSaved"));
    emit("saved");
  } catch (error) {
    const parsed = parseApiError(error);
    const fromServer = fieldErrorsFromServer(parseFieldErrors(error));
    if (Object.keys(fromServer).length > 0) errors.value = fromServer;
    else if (parsed.code === "stale_version" || parsed.code === "not_found") emit("stale");
    else if (parsed.status !== 401 && parsed.status !== 403) toast.error(t("admin.users.toast.failed"));
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md" data-slot="user-names-dialog">
      <DialogHeader>
        <DialogTitle>{{ t("admin.users.dialogs.names.title") }}</DialogTitle>
        <DialogDescription>{{ t("admin.users.dialogs.names.description") }}</DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" novalidate @submit.prevent="submit">
        <div v-for="field in FIELDS" :key="field" class="grid gap-1.5">
          <Label :for="`user-${field}`">{{ t(`admin.users.fields.${field}`) }}</Label>
          <Input
            :id="`user-${field}`"
            :model-value="values[field]"
            autocomplete="off"
            :aria-invalid="Boolean(errors[field])"
            :aria-describedby="errors[field] ? `user-${field}-error` : undefined"
            @update:model-value="(value: string | number) => edit(field, value)"
          />
          <p v-if="errors[field]" :id="`user-${field}-error`" class="text-destructive text-sm" role="alert">{{ messageOf(field) }}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="rename.isPending.value" @click="open = false">{{ t("admin.users.dialogs.cancel") }}</Button>
          <Button type="submit" :loading="rename.isPending.value">{{ t("admin.users.dialogs.names.save") }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
