<script setup lang="ts">
import { IconLayoutGrid, IconLayoutKanban, IconTable } from "@tabler/icons-vue";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AdminListView } from "./admin-list-view";

// The labelled view switch at the end of an admin list's toolbar (ADR-0027): Table plus the views the list offers.
// A single-choice toggle group: clicking the chosen view again keeps it chosen.
const props = withDefaults(defineProps<{ views?: readonly AdminListView[] }>(), { views: () => ["table", "cards"] });
const view = defineModel<AdminListView>({ required: true });
const { t } = useI18n();

const ICONS = { table: IconTable, cards: IconLayoutGrid, board: IconLayoutKanban };
const choose = (next: unknown) => {
  if (props.views.some((candidate) => candidate === next)) view.value = next as AdminListView;
};
const selected = "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground";
</script>

<template>
  <ToggleGroup type="single" variant="outline" data-slot="view-switch" class="ms-auto shrink-0" :aria-label="t('admin.listView.label')" :model-value="view" @update:model-value="choose">
    <ToggleGroupItem v-for="item in views" :key="item" :value="item" :class="selected"><component :is="ICONS[item]" aria-hidden="true" />{{ t(`admin.listView.${item}`) }}</ToggleGroupItem>
  </ToggleGroup>
</template>
