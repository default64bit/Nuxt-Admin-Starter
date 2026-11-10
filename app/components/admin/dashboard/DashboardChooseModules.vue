<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";
import { moduleTitleKey } from "~~/shared/constants/dashboard-modules";
import ModuleSamplePreview from "./ModuleSamplePreview.vue";

// Choose modules (admin-dashboard spec "Choose modules"): one preview card per module the admin may see, each with a
// checkbox. Ticking adds the module to the draft (at the end), unticking removes it; The footer counts the chosen modules. Nothing is saved here: Save and Cancel on the
// edit bar still decide.
const props = defineProps<{ open: boolean; available: readonly string[]; chosen: readonly string[] }>();
const emit = defineEmits<{ "update:open": [value: boolean]; add: [key: string]; remove: [key: string] }>();
const { t, num } = useAdminFormat();
const count = computed(() => props.available.filter((key) => props.chosen.includes(key)).length);
const toggle = (key: string, value: boolean | "indeterminate") => (value === true ? emit("add", key) : emit("remove", key));
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent data-slot="dashboard-choose-dialog" class="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ t("admin.dashboard.customize.chooseModules") }}</DialogTitle>
        <DialogDescription>{{ t("admin.dashboard.customize.choose.description") }}</DialogDescription>
      </DialogHeader>
      <ul data-slot="dashboard-choose-list" class="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        <li v-for="key in available" :key="key" data-slot="dashboard-choose-card" :data-module="key" :data-chosen="chosen.includes(key)" class="bg-card text-card-foreground flex flex-col gap-3 rounded-lg border p-3 data-[chosen=true]:border-primary">
          <div class="flex items-center gap-2">
            <Checkbox
              :id="`choose-${key}`"
              :model-value="chosen.includes(key)"
             
              :aria-label="t(moduleTitleKey(key))"
              data-slot="dashboard-choose-checkbox"
              @update:model-value="toggle(key, $event)"
            />
            <label :for="`choose-${key}`" class="min-w-0 flex-1 truncate text-sm font-medium">{{ t(moduleTitleKey(key)) }}</label>
            <span data-slot="dashboard-choose-sample" class="text-muted-foreground rounded border px-1.5 py-0.5 text-xs">{{ t("admin.dashboard.customize.choose.sample") }}</span>
          </div>
          <ModuleSamplePreview :module-key="key" />
        </li>
      </ul>
      <DialogFooter class="items-center sm:justify-between">
        <p data-slot="dashboard-choose-count" role="status" aria-live="polite" class="text-muted-foreground m-0 text-sm">{{ t("admin.dashboard.customize.choose.count", { n: num(count), total: num(available.length) }) }}</p>
        <Button type="button" size="sm" data-slot="dashboard-choose-done" @click="emit('update:open', false)">{{ t("admin.dashboard.customize.choose.done") }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
