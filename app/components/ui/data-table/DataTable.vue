<script setup lang="ts" generic="TData extends RowData">
import type { ColumnDef, RowData } from '@tanstack/vue-table'
import { FlexRender, useTable } from '@tanstack/vue-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import DataTablePagination from './DataTablePagination.vue'
import { features, type DataTableFeatures } from './features'

// Correctness patch to a base primitive (ADR-0012), recorded here on purpose: admin lists are
// paginated by the server. With `rowCount` the table runs in TanStack's manual-pagination mode:
// `data` is already the current page, `rowCount` is the server's total, `v-model:page` is the
// 1-based page, and a Previous/Next footer is shown. Without `rowCount` nothing changes
// (client-side use, no footer). Filtering and sorting stay client-side features nobody drives.
const props = withDefaults(defineProps<{
  columns: ColumnDef<DataTableFeatures, TData>[]
  data: TData[]
  clickableRows?: boolean
  rowCount?: number
  pageSize?: number
  /** Extra classes for a row, e.g. to dim archived rows. */
  rowClass?: (row: TData) => string | undefined
  /** Makes the horizontally scrolling table region keyboard-focusable and named (for tables with no links or buttons inside). */
  scrollLabel?: string
}>(), { rowCount: undefined, pageSize: 20, rowClass: undefined, scrollLabel: undefined })

const page = defineModel<number>('page', { default: 1 })
const serverDriven = computed(() => props.rowCount !== undefined)

const emit = defineEmits<{
  rowClick: [row: TData]
}>()

const table = useTable({
  features,
  get data() { return props.data },
  get columns() { return props.columns },
  get manualPagination() { return serverDriven.value },
  get rowCount() { return props.rowCount },
  get state() { return { pagination: { pageIndex: page.value - 1, pageSize: props.pageSize } } },
  onPaginationChange: (updater) => {
    const next = typeof updater === 'function' ? updater({ pageIndex: page.value - 1, pageSize: props.pageSize }) : updater
    if (next.pageIndex + 1 !== page.value) page.value = next.pageIndex + 1
  },
})

const range = computed(() => {
  const total = table.getRowCount()
  const from = (page.value - 1) * props.pageSize + 1
  return { from, to: Math.min(page.value * props.pageSize, total), total }
})
</script>

<template>
  <div class="rounded-md border">
    <Table :scroll-label="scrollLabel">
      <TableHeader class="bg-muted/40">
        <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <template v-for="header in headerGroup.headers" :key="header.id">
            <TableHead v-if="!header.isPlaceholder && !header.column.columnDef.meta?.headerless">
              <FlexRender :header="header" />
            </TableHead>
            <td v-else class="h-10 px-2" />
          </template>
        </TableRow>
      </TableHeader>
      <TableBody v-if="table.getRowModel().rows.length">
        <TableRow
          v-for="row in table.getRowModel().rows"
          :key="row.id"
          :class="[clickableRows ? 'cursor-pointer' : undefined, rowClass?.(row.original)]"
          @click="clickableRows ? emit('rowClick', row.original) : undefined"
        >
          <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
            <FlexRender :cell="cell" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <slot v-if="!table.getRowModel().rows.length" name="empty" />
    <DataTablePagination
      v-if="serverDriven && range.total > 0"
      :from="range.from"
      :to="range.to"
      :total="range.total"
      :can-previous="table.getCanPreviousPage()"
      :can-next="table.getCanNextPage()"
      @previous="table.previousPage()"
      @next="table.nextPage()"
    />
    <!-- A footer the page owns (a pager that spans several tables), joined to this table's border like the built-in one. -->
    <slot name="footer" />
  </div>
</template>
