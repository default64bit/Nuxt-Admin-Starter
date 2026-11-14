<script setup lang="ts">
import { IconChartBar, IconChevronDown } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSaveChartStyle } from "~/composables/admin/useAdminDashboard";
import { CHART_STYLES, type ChartStyle } from "~~/shared/schemas/admin-dashboard";
import ChartStyleThumbnail from "./ChartStyleThumbnail.vue";

// The Chart style button (admin-dashboard spec "Chart style picker"): a small menu of the available styles, each with
// a preview thumbnail and the current one ticked. Choosing saves at once, outside Customize too, optimistically.
const props = defineProps<{ modelValue: ChartStyle }>();
const { t } = useI18n();
const save = useSaveChartStyle();
const NAMES: Record<ChartStyle, string> = { soft: "admin.dashboard.chartStyle.soft", glow: "admin.dashboard.chartStyle.glow", pro: "admin.dashboard.chartStyle.pro" };
const choose = (value: unknown) => {
  if (typeof value === "string" && value !== props.modelValue && (CHART_STYLES as readonly string[]).includes(value)) save.mutate({ chartStyle: value as ChartStyle });
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button type="button" variant="outline" size="sm" data-slot="chart-style-trigger">
        <IconChartBar class="size-4" aria-hidden="true" />
        {{ t("admin.dashboard.chartStyle.button") }}
        <IconChevronDown class="size-4" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" data-slot="chart-style-menu">
      <DropdownMenuRadioGroup :model-value="modelValue" :aria-label="t('admin.dashboard.chartStyle.button')" @update:model-value="choose">
        <DropdownMenuRadioItem v-for="style in CHART_STYLES" :key="style" :value="style" :data-chart-style-option="style" class="gap-3 py-2">
          <ChartStyleThumbnail :style="style" />
          {{ t(NAMES[style]) }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
