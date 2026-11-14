<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { PERMISSION_GROUPS, permissionGroupHintKey, permissionGroupLabelKey, permissionHintKey, permissionLabelKey, type PermissionGroupId } from "~~/shared/constants/permission-catalog";
import { PERMISSION_KEYS, type PermissionKey } from "~~/shared/constants/permissions";
import { allowGroup, clearGroup, neededBy, withPrerequisites } from "~~/shared/utils/permission-prerequisites";

// The Permission editor, two-pane variant B (.specs/users-and-roles/spec.md): the catalogue's groups as navigation
// at inline-start (a scrolling row below `md`) with an "n/m" count each, and the selected group's Permissions as
// labelled switch rows. Switching a Permission on also switches on what it needs; a Permission another switched-on
// one needs cannot be switched off and says why. The selection is a Set of keys; the page owns it.
const props = defineProps<{ modelValue: ReadonlySet<PermissionKey>; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: Set<PermissionKey>] }>();

const { t, locale, num } = useAdminFormat();
const active = ref<PermissionGroupId>(PERMISSION_GROUPS[0]!.id);
const group = computed(() => PERMISSION_GROUPS.find((candidate) => candidate.id === active.value)!);

const countIn = (id: PermissionGroupId) => {
  const keys = PERMISSION_GROUPS.find((candidate) => candidate.id === id)!.keys;
  return { on: keys.filter((key) => props.modelValue.has(key)).length, total: keys.length };
};
const allOn = computed(() => countIn(active.value).on === group.value.keys.length);

/** The labels of the switched-on Permissions that need this one, as a sentence fragment. */
const blockers = (key: PermissionKey) =>
  PERMISSION_KEYS.filter((other) => neededBy(key, props.modelValue).includes(other))
    .map((other) => t(permissionLabelKey(other)))
    .join(locale.value === "fa" ? "، " : ", ");

function toggle(key: PermissionKey, on: boolean) {
  if (props.disabled) return;
  if (on) emit("update:modelValue", withPrerequisites([...props.modelValue, key]));
  else if (neededBy(key, props.modelValue).length === 0) {
    const next = new Set(props.modelValue);
    next.delete(key);
    emit("update:modelValue", next);
  }
}
const bulk = () => emit("update:modelValue", allOn.value ? clearGroup(props.modelValue, active.value) : allowGroup(props.modelValue, active.value));
</script>

<template>
  <div class="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]" data-slot="permission-editor">
    <nav :aria-label="t('admin.roles.editor.groups')" class="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible" data-slot="permission-groups">
      <button
        v-for="item in PERMISSION_GROUPS"
        :key="item.id"
        type="button"
        :aria-current="item.id === active ? 'true' : undefined"
        :data-group="item.id"
        :class="cn('hover:bg-muted flex shrink-0 items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-start text-sm transition-colors md:w-full', item.id === active && 'bg-muted border-border font-medium')"
        @click="active = item.id"
      >
        <span class="whitespace-nowrap">{{ t(permissionGroupLabelKey(item.id)) }}</span>
        <span :class="cn('text-xs tabular-nums', item.id === active ? 'text-foreground' : 'text-muted-foreground')" data-slot="group-count">{{ t("admin.roles.editor.count", { on: num(countIn(item.id).on), total: num(countIn(item.id).total) }) }}</span>
      </button>
    </nav>

    <section class="grid min-w-0 content-start gap-3" :aria-label="t(permissionGroupLabelKey(active))" data-slot="permission-pane">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="grid gap-0.5">
          <h2 class="text-base font-semibold">{{ t(permissionGroupLabelKey(active)) }}</h2>
          <p class="text-muted-foreground text-sm">{{ t(permissionGroupHintKey(active)) }}</p>
        </div>
        <Button type="button" variant="outline" size="sm" :disabled="disabled" data-slot="group-bulk" @click="bulk">{{ allOn ? t("admin.roles.editor.clearGroup") : t("admin.roles.editor.allowGroup") }}</Button>
      </div>
      <ul class="divide-y rounded-lg border">
        <li v-for="key in group.keys" :key="key" class="flex items-start justify-between gap-4 p-3" :data-permission="key">
          <div class="grid min-w-0 gap-0.5">
            <span :id="`perm-${key}`" class="text-sm font-medium">{{ t(permissionLabelKey(key)) }}</span>
            <span :id="`perm-${key}-hint`" class="text-muted-foreground text-sm">{{ t(permissionHintKey(key)) }}</span>
            <span v-if="modelValue.has(key) && neededBy(key, modelValue).length" :id="`perm-${key}-needed`" class="text-muted-foreground text-xs" data-slot="needed-by">
              {{ t("admin.roles.editor.neededBy", { names: blockers(key) }) }}
            </span>
          </div>
          <Switch
            :model-value="modelValue.has(key)"
            :disabled="disabled || (modelValue.has(key) && neededBy(key, modelValue).length > 0)"
            :aria-labelledby="`perm-${key}`"
            :aria-describedby="`perm-${key}-hint${modelValue.has(key) && neededBy(key, modelValue).length ? ` perm-${key}-needed` : ''}`"
            class="mt-0.5"
            @update:model-value="(on: boolean) => toggle(key, on)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>
