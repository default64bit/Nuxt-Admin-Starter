<script setup lang="ts" generic="TItem extends { id: string }">
import { DataTablePagination } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { useAdminNav } from "~/composables/admin/useAdminNav";
import { adminHue } from "~~/shared/constants/admin-nav";

// The card view of a server-driven admin list (ADR-0027): the same page of records as the table, one card per
// record from the default slot, the table's "no results" content from `#empty`, and the same Previous/Next footer.
// `layout` only sets the grid: `rows` for wide one-line cards, `stats` for medium cards, `tiles` for narrow cards
// with a picture on top. The section's hue is set here so every card's tinted media tile matches the page icon.
const props = defineProps<{
  items: TItem[];
  total: number;
  pageSize: number;
  layout: "rows" | "stats" | "tiles";
  /** Accessible name of the list, usually the page title. */
  label: string;
}>();
const page = defineModel<number>("page", { default: 1 });

const { current } = useAdminNav();
const hue = computed(() => adminHue(current.value?.key));
const range = computed(() => ({ from: (page.value - 1) * props.pageSize + 1, to: Math.min(page.value * props.pageSize, props.total) }));
const grid = {
  rows: "grid-cols-1 gap-2 xl:grid-cols-2",
  stats: "grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3",
  tiles: "grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
};
</script>

<template>
  <div data-slot="card-list" class="flex flex-col gap-4" :style="{ '--admin-hue': `${hue}deg` }">
    <div v-if="!items.length" class="rounded-md border"><slot name="empty" /></div>
    <ul v-else :aria-label="label" :class="cn('grid', grid[layout])">
      <li v-for="item in items" :key="item.id" class="flex min-w-0">
        <slot :item="item" />
      </li>
    </ul>
    <div v-if="total > 0" class="overflow-hidden rounded-md border [&>nav]:border-t-0">
      <DataTablePagination :from="range.from" :to="range.to" :total="total" :can-previous="page > 1" :can-next="page * pageSize < total" @previous="page = page - 1" @next="page = page + 1" />
    </div>
  </div>
</template>
