<script setup lang="ts">
import { IconCalendar, IconChevronDown } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ModuleRangeKey } from "~~/shared/constants/analytics";

// A module's range menu (admin-dashboard spec "Range menu"): the ranges the module offers, the current one
// ticked. Choosing one only reports it; the module saves it at once and refetches.
const props = defineProps<{ ranges: readonly ModuleRangeKey[]; modelValue: ModuleRangeKey; moduleTitle: string }>();
const emit = defineEmits<{ "update:modelValue": [range: ModuleRangeKey] }>();
const { t } = useI18n();
// Message keys are camelCase; range keys are kebab-case and two of them hold digits.
const NAMES: Record<ModuleRangeKey, string> = {
  today: "today",
  yesterday: "yesterday",
  "last-7-days": "last7Days",
  "last-30-days": "last30Days",
  "this-month": "thisMonth",
  "last-month": "lastMonth",
};
const label = (range: ModuleRangeKey) => t(`admin.dashboard.range.${NAMES[range]}`);
const current = computed(() => label(props.modelValue));
const choose = (value: unknown) => {
  if (typeof value === "string" && value !== props.modelValue && (props.ranges as readonly string[]).includes(value)) emit("update:modelValue", value as ModuleRangeKey);
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button type="button" variant="outline" size="sm" data-slot="dashboard-range-trigger" :aria-label="t('admin.dashboard.range.menuLabel', { module: moduleTitle, range: current })">
        <IconCalendar class="size-4" aria-hidden="true" />
        <span data-slot="dashboard-range-current">{{ current }}</span>
        <IconChevronDown class="size-4" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" data-slot="dashboard-range-menu">
      <DropdownMenuRadioGroup :model-value="modelValue" @update:model-value="choose">
        <DropdownMenuRadioItem v-for="range in ranges" :key="range" :value="range" :data-range="range">{{ label(range) }}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
