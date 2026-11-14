<script setup lang="ts">
import { IconArrowsSort, IconChevronDown, IconRulerMeasure, IconX } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import type { DashboardWidth } from "~~/shared/constants/dashboard-modules";
import type { MoveDirection } from "~~/shared/utils/sortable";

// A module's edit toolbar in Customize mode (admin-dashboard spec "Customize mode"), above its title and in this order:
// the grip slot (the drag grip button, set by the grid; Needs attention shows a lock instead), the Move menu, the size
// among the module's allowed widths and the Fill toggle. A round remove button overhangs the module's top end corner
// (left in `fa`, right in `en`).
const props = defineProps<{ moduleTitle: string; width: DashboardWidth; widths: readonly DashboardWidth[]; fill: boolean; position: number; total: number; fixed?: boolean }>();
const emit = defineEmits<{ move: [direction: MoveDirection]; resize: [width: DashboardWidth]; fill: [value: boolean]; remove: [] }>();
const { t } = useI18n();

const MOVES: Array<{ direction: MoveDirection; key: string }> = [
  { direction: "start", key: "start" },
  { direction: "earlier", key: "earlier" },
  { direction: "later", key: "later" },
  { direction: "end", key: "end" },
];
const cannot = (direction: MoveDirection) => (direction === "start" || direction === "earlier" ? props.position <= 1 : props.position >= props.total);
const chooseWidth = (value: unknown) => {
  if (typeof value === "string" && value !== props.width && (props.widths as readonly string[]).includes(value)) emit("resize", value as DashboardWidth);
};
const fillId = useId();
</script>

<template>
  <div data-slot="dashboard-edit-toolbar" role="group" :aria-label="t('admin.dashboard.customize.toolbar', { module: moduleTitle })" class="flex flex-wrap items-center gap-2">
    <slot name="grip" />

    <DropdownMenu v-if="!fixed">
      <DropdownMenuTrigger as-child>
        <Button type="button" variant="outline" size="sm" data-slot="dashboard-move-trigger" :aria-label="t('admin.dashboard.customize.moveLabel', { module: moduleTitle })">
          <IconArrowsSort class="size-4" aria-hidden="true" />
          {{ t("admin.dashboard.customize.move") }}
          <IconChevronDown class="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-slot="dashboard-move-menu">
        <DropdownMenuItem v-for="item in MOVES" :key="item.direction" :disabled="cannot(item.direction)" :data-move="item.direction" @select="emit('move', item.direction)">
          {{ t(`admin.dashboard.customize.moveTo.${item.key}`) }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button type="button" variant="outline" size="sm" data-slot="dashboard-size-trigger" :aria-label="t('admin.dashboard.customize.sizeLabel', { module: moduleTitle, size: t(`admin.dashboard.customize.widths.${width}`) })">
          <IconRulerMeasure class="size-4" aria-hidden="true" />
          {{ t(`admin.dashboard.customize.widths.${width}`) }}
          <IconChevronDown class="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-slot="dashboard-size-menu">
        <DropdownMenuRadioGroup :model-value="width" @update:model-value="chooseWidth">
          <DropdownMenuRadioItem v-for="option in widths" :key="option" :value="option" :data-width="option">{{ t(`admin.dashboard.customize.widths.${option}`) }}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>

    <span class="inline-flex items-center gap-2 text-sm">
      <Switch :id="fillId" data-slot="dashboard-fill" :model-value="fill" :aria-label="t('admin.dashboard.customize.fillLabel', { module: moduleTitle })" @update:model-value="emit('fill', $event === true)" />
      <label :for="fillId">{{ t("admin.dashboard.customize.fill") }}</label>
    </span>

    <Button
      v-if="!fixed"
      type="button"
      variant="secondary"
      size="icon"
      data-slot="dashboard-remove"
      :aria-label="t('admin.dashboard.customize.remove', { module: moduleTitle })"
      class="border-background absolute -top-3 -inset-e-3 z-10 size-7 rounded-full border-2 shadow-sm"
      @click="emit('remove')"
    >
      <IconX class="size-4" aria-hidden="true" />
    </Button>
  </div>
</template>
