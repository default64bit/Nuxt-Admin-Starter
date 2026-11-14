<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountResponse } from "~~/shared/schemas/account";
import { canSave, validateNames, type NameErrors, type NameField, type NameValues } from "~~/shared/utils/account-form";
import { formatPhoneForDisplay } from "~~/shared/utils/locale-digits";

// The My account form (users-and-roles spec, "My account"): given and family name, the read-only sign-in phone with
// its Change action, and Save. Save stays disabled until both names are valid and differ from what is saved; an
// error shows under a field after it was left (never while typing) or when the server names it.
const props = defineProps<{ account: AccountResponse; saving?: boolean; serverErrors?: NameErrors }>();
const emit = defineEmits<{ submit: [values: NameValues]; "change-phone": [] }>();

const { t, locale } = useI18n();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const phone = computed(() => formatPhoneForDisplay(props.account.phone, digits.value));

const fromAccount = (account: AccountResponse): NameValues => ({ givenName: account.givenName ?? "", familyName: account.familyName ?? "" });
const values = reactive<NameValues>(fromAccount(props.account));
const touched = reactive<Record<NameField, boolean>>({ givenName: false, familyName: false });
const dismissed = reactive<Record<NameField, boolean>>({ givenName: false, familyName: false });

const saveEnabled = computed(() => canSave(values, props.account));
const validation = computed(() => validateNames(values));

// A refreshed account (after a save) replaces the fields unless the User has typed something that is not saved yet
// and it is not what was just saved.
watch(
  () => props.account,
  (next, previous) => {
    const typedSomethingUnsaved = canSave(values, previous);
    const justSaved = validateNames(values).ok && !canSave(values, next);
    if (typedSomethingUnsaved && !justSaved) return;
    Object.assign(values, fromAccount(next));
    touched.givenName = touched.familyName = false;
  },
);
// A new server verdict applies again to the field it names.
watch(
  () => props.serverErrors,
  () => {
    dismissed.givenName = dismissed.familyName = false;
  },
);

// The API's stable error keys are snake_case; the message catalog is lowerCamel.
const MESSAGE_KEY = { required: "required", too_long: "tooLong", control_characters: "controlCharacters", invalid: "invalid" } as const;

function errorOf(field: NameField): string | undefined {
  const server = dismissed[field] ? undefined : props.serverErrors?.[field];
  const local = touched[field] && !validation.value.ok ? validation.value.errors[field] : undefined;
  const key = server ?? local;
  return key ? t(`admin.account.errors.${MESSAGE_KEY[key]}`) : undefined;
}
function edit(field: NameField, value: string | number) {
  values[field] = String(value);
  dismissed[field] = true;
}
function onSubmit() {
  touched.givenName = touched.familyName = true;
  const result = validateNames(values);
  if (!result.ok || !saveEnabled.value) return;
  emit("submit", result.values);
}

const FIELDS = [
  { name: "givenName", autocomplete: "given-name", labelKey: "admin.account.givenName.label" },
  { name: "familyName", autocomplete: "family-name", labelKey: "admin.account.familyName.label" },
] as const;
</script>

<template>
  <form data-slot="account-form" class="flex max-w-2xl flex-col gap-6" :aria-busy="saving || undefined" novalidate @submit.prevent="onSubmit">
    <Card>
      <CardContent class="flex flex-col gap-4">
        <div class="grid gap-4 md:grid-cols-2">
          <div v-for="field in FIELDS" :key="field.name" class="flex flex-col gap-2">
            <Label :for="`account-${field.name}`">{{ t(field.labelKey) }}</Label>
            <Input
              :id="`account-${field.name}`"
              :model-value="values[field.name]"
              :name="field.name"
              :autocomplete="field.autocomplete"
              :readonly="saving"
              :aria-invalid="errorOf(field.name) ? 'true' : undefined"
              :aria-describedby="errorOf(field.name) ? `account-${field.name}-error` : undefined"
              @update:model-value="edit(field.name, $event)"
              @blur="touched[field.name] = true"
            />
            <p v-if="errorOf(field.name)" :id="`account-${field.name}-error`" data-slot="field-error" class="text-destructive text-sm">{{ errorOf(field.name) }}</p>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="account-phone">{{ t("admin.account.phone.label") }}</Label>
          <div class="flex items-center gap-2">
            <Input id="account-phone" :model-value="phone" name="phone" dir="ltr" inputmode="tel" readonly autocomplete="off" class="text-start" />
            <Button type="button" variant="outline" data-slot="change-phone" :aria-label="t('admin.account.phone.changeLabel')" @click="emit('change-phone')">
              {{ t("admin.account.phone.change") }}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    <div>
      <Button type="submit" data-slot="account-save" :disabled="!saveEnabled || saving">{{ t("admin.account.save") }}</Button>
    </div>
  </form>
</template>
