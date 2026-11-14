import type { CellData, RowData, TableFeatures } from '@tanstack/vue-table'
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from '@tanstack/vue-table'

export type DataTableColumnMeta = {
  headerless?: boolean
}

declare module '@tanstack/table-core' {
  interface ColumnMeta<TFeatures extends TableFeatures, TData extends RowData, TValue extends CellData> {
    headerless?: boolean
  }
}

export const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  columnMeta: {} as DataTableColumnMeta,
})

export type DataTableFeatures = typeof features
