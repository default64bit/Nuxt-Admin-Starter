<script setup lang="ts">
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";

// Explicit Previous/Next controls only (admin-table rule: no page numbers, no page-size selector).
// Presentational: `DataTable` owns the TanStack state and passes what the footer needs.
const props = defineProps<{ from: number; to: number; total: number; canPrevious: boolean; canNext: boolean }>();
const emit = defineEmits<{ previous: []; next: [] }>();

const { t, locale } = useI18n();
const digits = (value: number) => toLocaleDigits(String(value), locale.value === "en" ? "en" : "fa");
const summary = computed(() => t("admin.table.showing", { from: digits(props.from), to: digits(props.to), total: digits(props.total) }));
</script>

<template>
  <nav data-slot="table-pagination" :aria-label="t('admin.table.pagination')" class="flex flex-wrap items-center justify-between gap-3 bg-muted/40 border-t px-3 py-2">
    <p class="text-muted-foreground text-sm" role="status">{{ summary }}</p>
    <div class="flex items-center gap-2">
      <Button data-slot="table-previous" type="button" variant="outline" size="sm" :disabled="!canPrevious" @click="emit('previous')">
        <IconChevronLeft class="rtl:rotate-180" aria-hidden="true" />{{ t("admin.table.previous") }}
      </Button>
      <Button data-slot="table-next" type="button" variant="outline" size="sm" :disabled="!canNext" @click="emit('next')">
        {{ t("admin.table.next") }}<IconChevronRight class="rtl:rotate-180" aria-hidden="true" />
      </Button>
    </div>
  </nav>
</template>
