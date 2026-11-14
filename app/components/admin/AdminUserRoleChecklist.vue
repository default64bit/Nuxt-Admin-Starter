<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAdminRoleOptions } from "~/composables/admin/useAdminRoles";

// A checklist of every Role for the New user and Edit roles dialogs. The `super` Role is offered only to a super
// actor (the Role lookup says whether the asking User is one), and `lockedSuper` keeps it on and disabled for the
// Default admin, whose `super` membership can't be removed.
const props = defineProps<{ lockedSuper?: boolean; disabled?: boolean; invalid?: boolean; describedby?: string }>();
const selected = defineModel<string[]>({ required: true });

const { t } = useI18n();
const options = useAdminRoleOptions();
const roles = computed(() => (options.data.value?.items ?? []).filter((role) => options.data.value?.viewerIsSuper || !role.isSuper));
const labelOf = (role: { name: string; isSuper: boolean }) => (role.isSuper ? t("admin.roles.superName") : role.name);
const isLocked = (role: { isSuper: boolean }) => Boolean(props.lockedSuper && role.isSuper);
const toggle = (id: string, on: boolean) => {
  selected.value = on ? [...new Set([...selected.value, id])] : selected.value.filter((value) => value !== id);
};
</script>

<template>
  <div class="grid gap-2" data-slot="role-checklist">
    <div v-if="options.isError.value" role="alert" class="flex flex-col items-start gap-2 rounded-lg border p-3 text-sm">
      <p>{{ t("admin.users.dialogs.roles.loadError") }}</p>
      <Button type="button" variant="outline" size="sm" @click="options.refetch()">{{ t("admin.shell.retry") }}</Button>
    </div>
    <div v-else-if="options.isPending.value" class="grid gap-2" aria-busy="true"><Skeleton v-for="n in 3" :key="n" class="h-9 w-full" /></div>
    <p v-else-if="roles.length === 0" class="text-muted-foreground rounded-lg border p-3 text-sm">{{ t("admin.users.dialogs.roles.none") }}</p>
    <div v-else role="group" :aria-describedby="describedby" :aria-label="t('admin.users.dialogs.roles.groupLabel')">
      <ul class="divide-y rounded-lg border" :class="invalid ? 'border-destructive' : undefined">
        <li v-for="role in roles" :key="role.id" class="flex items-center justify-between gap-3 p-3">
          <label :for="`role-${role.id}`" class="min-w-0 flex-1 truncate text-sm font-medium">{{ labelOf(role) }}</label>
          <Switch :id="`role-${role.id}`" :model-value="selected.includes(role.id)" :disabled="disabled || isLocked(role)" @update:model-value="(on: boolean) => toggle(role.id, on)" />
        </li>
      </ul>
    </div>
  </div>
</template>
