<script setup lang="ts">
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdminUserRoleChecklist from "~/components/admin/AdminUserRoleChecklist.vue";
import { useUserMutations } from "~/composables/admin/useAdminUsers";
import { fieldErrorsFromServer, validateNames, type NameErrorKey, type NameErrors, type NameField } from "~~/shared/utils/account-form";
import { parseApiError, parseFieldErrors } from "~~/shared/utils/api-error-client";
import { localizedPath } from "~~/shared/utils/locale-path";
import { normalizeIranianMobile } from "~~/shared/utils/phone";

// New user (.specs/users-and-roles/spec.md "Creating a User"): the phone, both names or neither, and at least one
// Role. No code or SMS is sent. An existing phone offers "Open that account". The dialog owns its mutation and
// reports `created` with the new account's id.
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ created: [id: string] }>();

const { t, locale } = useI18n();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const { create } = useUserMutations();

const phone = ref("");
const names = reactive<Record<NameField, string>>({ givenName: "", familyName: "" });
const roleIds = ref<string[]>([]);
const phoneError = ref<"required" | "invalid" | null>(null);
const nameErrors = ref<NameErrors>({});
const rolesError = ref(false);
const existingId = ref<string | null>(null);

// Each opening starts blank.
watch(open, (isOpen) => {
  if (!isOpen) return;
  phone.value = "";
  names.givenName = names.familyName = "";
  roleIds.value = [];
  phoneError.value = null;
  nameErrors.value = {};
  rolesError.value = false;
  existingId.value = null;
});
watch(phone, () => {
  phoneError.value = null;
  existingId.value = null;
});
watch(roleIds, () => (rolesError.value = false));

const MESSAGE: Record<NameErrorKey, string> = { required: "required", too_long: "tooLong", control_characters: "controlCharacters", invalid: "invalid" };
const FIELDS: NameField[] = ["givenName", "familyName"];
const messageOf = (field: NameField) => (nameErrors.value[field] ? t(`admin.users.errors.${MESSAGE[nameErrors.value[field]!]}`) : undefined);
const editName = (field: NameField, value: string | number) => {
  names[field] = String(value);
  nameErrors.value = { ...nameErrors.value, [field]: undefined };
};

async function submit() {
  if (create.isPending.value) return;
  const normalized = phone.value.trim() ? normalizeIranianMobile(phone.value) : null;
  phoneError.value = !phone.value.trim() ? "required" : normalized ? null : "invalid";
  // Names are optional, but both or neither.
  const bothEmpty = !names.givenName.trim() && !names.familyName.trim();
  const checked = bothEmpty ? null : validateNames(names);
  nameErrors.value = checked && !checked.ok ? checked.errors : {};
  rolesError.value = roleIds.value.length === 0;
  if (phoneError.value || Object.keys(nameErrors.value).length > 0 || rolesError.value) return;
  try {
    const created = await create.mutateAsync({ phone: phone.value, ...(checked?.ok ? checked.values : {}), roleIds: roleIds.value });
    toast.success(t("admin.users.toast.created"));
    emit("created", created.id);
  } catch (error) {
    const parsed = parseApiError(error);
    const fieldErrors = parseFieldErrors(error);
    if (parsed.code === "phone_in_use") {
      existingId.value = (error as { data?: { data?: { userId?: string } } }).data?.data?.userId ?? null;
      phoneError.value = null;
    } else if (fieldErrors.phone?.length) phoneError.value = "invalid";
    else if (Object.keys(fieldErrorsFromServer(fieldErrors)).length > 0) nameErrors.value = fieldErrorsFromServer(fieldErrors);
    else if (Object.keys(fieldErrors).some((key) => key.startsWith("roleIds"))) rolesError.value = true;
    else if (parsed.status !== 401 && parsed.status !== 403) toast.error(t("admin.users.toast.failed"));
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-md" data-slot="user-create-dialog">
      <DialogHeader>
        <DialogTitle>{{ t("admin.users.dialogs.create.title") }}</DialogTitle>
        <DialogDescription>{{ t("admin.users.dialogs.create.description") }}</DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" novalidate @submit.prevent="submit">
        <div class="grid gap-1.5">
          <Label for="new-user-phone">{{ t("admin.users.fields.phone") }}</Label>
          <Input
            id="new-user-phone"
            v-model="phone"
            type="tel"
            inputmode="tel"
            dir="ltr"
            autocomplete="off"
            :placeholder="digits === 'fa' ? '۰۹۱۲ ۰۰۰ ۰۰۰۰' : '0912 000 0000'"
            :aria-invalid="Boolean(phoneError || existingId)"
            :aria-describedby="phoneError || existingId ? 'new-user-phone-error' : undefined"
          />
          <p v-if="phoneError" id="new-user-phone-error" class="text-destructive text-sm" role="alert">{{ t(`admin.users.dialogs.create.errors.phone.${phoneError}`) }}</p>
          <div v-else-if="existingId" id="new-user-phone-error" class="text-destructive grid justify-items-start gap-1 text-sm" role="alert" data-slot="phone-in-use">
            <p>{{ t("admin.users.dialogs.create.errors.phone.inUse") }}</p>
            <NuxtLink :to="localizedPath(`/admin/users/${existingId}`, digits)" class="font-medium underline" @click="open = false">{{ t("admin.users.dialogs.create.openAccount") }}</NuxtLink>
          </div>
        </div>
        <fieldset class="grid gap-3">
          <legend class="text-muted-foreground mb-1 text-sm">{{ t("admin.users.dialogs.create.namesHint") }}</legend>
          <div v-for="field in FIELDS" :key="field" class="grid gap-1.5">
            <Label :for="`new-user-${field}`">{{ t(`admin.users.fields.${field}`) }}</Label>
            <Input
              :id="`new-user-${field}`"
              :model-value="names[field]"
              autocomplete="off"
              :aria-invalid="Boolean(nameErrors[field])"
              :aria-describedby="nameErrors[field] ? `new-user-${field}-error` : undefined"
              @update:model-value="(value: string | number) => editName(field, value)"
            />
            <p v-if="nameErrors[field]" :id="`new-user-${field}-error`" class="text-destructive text-sm" role="alert">{{ messageOf(field) }}</p>
          </div>
        </fieldset>
        <div class="grid gap-1.5">
          <p class="text-sm font-medium">{{ t("admin.users.dialogs.create.rolesTitle") }}</p>
          <AdminUserRoleChecklist v-model="roleIds" :invalid="rolesError" describedby="new-user-roles-error" />
          <p v-if="rolesError" id="new-user-roles-error" class="text-destructive text-sm" role="alert">{{ t("admin.users.dialogs.roles.problems.none") }}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="create.isPending.value" @click="open = false">{{ t("admin.users.dialogs.cancel") }}</Button>
          <Button type="submit" :loading="create.isPending.value">{{ t("admin.users.dialogs.create.submit") }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
