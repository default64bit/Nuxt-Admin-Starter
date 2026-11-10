<script setup lang="ts">
import { useChartStyle } from "~/composables/admin/useChartStyle";
import { dashboardModule, moduleTitleKey, type DashboardWidth, type DashboardModuleKey } from "~~/shared/constants/dashboard-modules";
import { layoutSpans, type DashboardLayoutEntry } from "~~/shared/utils/dashboard-layout";
import { IconGripVertical } from "@tabler/icons-vue";
import type { MoveDirection, Placement } from "~~/shared/utils/sortable";
import { useSortableMonitor } from "~/composables/admin/useSortableItem";
import DashboardEditToolbar from "./DashboardEditToolbar.vue";
import DashboardSortableItem from "./DashboardSortableItem.vue";
import { MODULE_COMPONENTS } from "./module-components";

// The module grid (admin-dashboard spec "Grid"): 6 columns at `lg` and up (a third is 2, a half 3, a full row
// 6), 2 on tablets (a third and a half take 1, a full row 2) and 1 on phones, in the same order. A row that ends with
// a gap gives it to its Fill modules (desktop and tablet; phones have one column). Column spans are classes, never
// server-rendered `style` attributes. The component of a module comes from the typed `MODULE_COMPONENTS` lookup. In Customize mode every module is
// outlined with its content dimmed (desaturated: lowering opacity would break text contrast) and an edit toolbar above its title; the grid only reports what the admin asks for.
const props = defineProps<{ modules: readonly DashboardLayoutEntry[]; editing?: boolean }>();
const emit = defineEmits<{ move: [key: string, direction: MoveDirection]; resize: [key: string, width: DashboardWidth]; fill: [key: string, value: boolean]; remove: [key: string]; reorder: [key: string, targetKey: string, placement: Placement] }>();
useSortableMonitor((key, targetKey, placement) => emit("reorder", key, targetKey, placement), () => props.editing === true);
const { t } = useI18n();
const chartStyle = useChartStyle();

// Literal classes so Tailwind finds them. A span of 1 or 2 columns on tablets, 1 to 6 on desktop.
const MD_SPAN: Record<number, string> = { 1: "md:col-span-1", 2: "md:col-span-2" };
const LG_SPAN: Record<number, string> = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4", 5: "lg:col-span-5", 6: "lg:col-span-6" };
const classes = computed(() => {
  const tablet = layoutSpans(props.modules, 2);
  const desktop = layoutSpans(props.modules, 6);
  return props.modules.map((_, index) => `${MD_SPAN[tablet[index]!]} ${LG_SPAN[desktop[index]!]}`);
});
const widthsOf = (key: string) => dashboardModule(key)?.widths ?? [];

// Cards slide to their new place after a reorder (a FLIP: measure before the update, play the difference after it).
// Skipped under reduced motion, and where the browser cannot animate.
const list = ref<HTMLElement | null>(null);
const rects = new Map<string, DOMRect>();
const items = () => [...(list.value?.children ?? [])] as HTMLElement[];
watch(() => props.modules.map((entry) => entry.key).join(), () => {
  rects.clear();
  for (const element of items()) rects.set(element.dataset.module!, element.getBoundingClientRect());
}, { flush: "pre" });
watch(() => props.modules.map((entry) => entry.key).join(), async () => {
  await nextTick();
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  for (const element of items()) {
    const before = rects.get(element.dataset.module!);
    if (!before || typeof element.animate !== "function") continue;
    const after = element.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (dx !== 0 || dy !== 0) element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 300, easing: "ease-out" });
  }
}, { flush: "post" });
</script>

<template>
  <ul
    ref="list"
    data-slot="dashboard-grid"
    :data-editing="editing || undefined"
    :data-chart-style="chartStyle"
    :aria-label="t('admin.dashboard.grid')"
    class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6"
  >
    <DashboardSortableItem
      v-for="(entry, index) in modules"
      :key="entry.key"
      :item-key="entry.key"
      :enabled="editing === true"
      :data-module="entry.key"
      :data-width="entry.width"
      :data-fill="entry.fill || undefined"
      :class="[classes[index], editing && 'relative flex flex-col gap-2 rounded-xl p-2 outline-1 outline-dashed outline-offset-0 outline-border [&_[data-slot=card-content]]:grayscale']"
    >
      <DashboardEditToolbar
        v-if="editing"
        :module-title="t(moduleTitleKey(entry.key))"
        :width="entry.width"
        :widths="widthsOf(entry.key)"
        :fill="entry.fill"
        :position="index + 1"
        :total="modules.length"
        @move="(direction) => emit('move', entry.key, direction)"
        @resize="(width) => emit('resize', entry.key, width)"
        @fill="(value) => emit('fill', entry.key, value)"
        @remove="emit('remove', entry.key)"
      >
        <template #grip>
          <button
            type="button"
            data-slot="dashboard-grip"
            :aria-label="t('admin.dashboard.customize.grip', { module: t(moduleTitleKey(entry.key)) })"
            class="text-muted-foreground hover:bg-accent focus-visible:ring-ring inline-flex size-8 cursor-grab touch-none items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing"
          >
            <IconGripVertical class="size-4" aria-hidden="true" />
          </button>
        </template>
      </DashboardEditToolbar>
      <div :class="editing ? 'min-h-0 flex-1' : 'h-full'">
        <component :is="MODULE_COMPONENTS[entry.key as DashboardModuleKey]" v-if="entry.key in MODULE_COMPONENTS" :index="index" />
      </div>
    </DashboardSortableItem>
  </ul>
</template>
