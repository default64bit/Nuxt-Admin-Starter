<script setup lang="ts">
// One admin Board column (ADR-0027): a header with the column's name and count, a scrolling list of cards from the
// default slot (each an `<li>`), its loading / error / empty states, and a "Show more" button for the next 20.
// It is also a drop target for a card the page says may land here (`canDropFrom`).
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";
import { BOARD_CARD_KIND } from "./board-drag";

const props = defineProps<{
  column: string;
  title: string;
  /** The column's total, once known. */
  count?: number;
  /** How many cards are shown, for the "Show more" label. */
  shown: number;
  loading?: boolean;
  failed?: boolean;
  /** A refetch is replacing the cards (they dim). */
  stale?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  moreFailed?: boolean;
  /** The column the dragged card comes from, if any. */
  dragFrom: string | null;
  /** Whether a card dragged from `from` may be dropped on this column. */
  canDropFrom: (from: string) => boolean;
}>();
const emit = defineEmits<{ drop: [id: string, from: string]; retry: []; more: [] }>();
defineSlots<{ icon(): unknown; default(): unknown }>();
const { t, locale } = useI18n();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const number = (value: number) => toLocaleDigits(String(value), digits.value);

const legal = computed(() => props.dragFrom !== null && props.canDropFrom(props.dragFrom));
const refused = computed(() => props.dragFrom !== null && props.dragFrom !== props.column && !legal.value);
const over = ref(false);
const remaining = computed(() => Math.max(0, (props.count ?? 0) - props.shown));

const root = ref<HTMLElement | null>(null);
let cleanup: (() => void) | undefined;
onMounted(() => {
  if (!root.value) return;
  cleanup = dropTargetForElements({
    element: root.value,
    canDrop: ({ source }) => source.data.kind === BOARD_CARD_KIND && props.canDropFrom(String(source.data.column)),
    onDragEnter: () => (over.value = true),
    onDragLeave: () => (over.value = false),
    onDrop: ({ source }) => {
      over.value = false;
      emit("drop", String(source.data.id), String(source.data.column));
    },
  });
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <section
    ref="root"
    :aria-labelledby="`board-column-${column}`"
    data-slot="board-column"
    :data-column="column"
    :data-drop="legal ? 'legal' : refused ? 'refused' : undefined"
    class="bg-muted/30 flex h-full flex-col rounded-2xl border border-transparent transition-[opacity,box-shadow,background-color]"
    :class="[legal ? 'ring-primary/70 ring-offset-background ring-2 ring-offset-2' : '', legal && over ? 'bg-primary/10' : '', refused ? 'opacity-40' : '']"
  >
    <header class="flex items-center gap-2 px-3.5 pt-3.5 pb-3">
      <slot name="icon" />
      <h2 :id="`board-column-${column}`" class="text-sm font-semibold">{{ title }}</h2>
      <span v-if="count !== undefined" class="text-muted-foreground text-sm tabular-nums" data-slot="board-column-count">{{ number(count) }}</span>
      <span v-if="legal" class="bg-primary text-primary-foreground ms-auto rounded-full px-2 py-0.5 text-[11px] font-medium">{{ t("admin.boardView.dropHere") }}</span>
    </header>

    <div class="flex max-h-[calc(100dvh-16rem)] min-h-48 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5" :class="stale ? 'opacity-60' : undefined">
      <div v-if="failed" role="alert" class="flex flex-col items-start gap-2 rounded-xl border p-3">
        <p class="text-sm">{{ t("admin.boardView.loadError") }}</p>
        <Button type="button" variant="outline" size="sm" @click="emit('retry')">{{ t("admin.shell.retry") }}</Button>
      </div>
      <template v-else-if="loading">
        <Skeleton v-for="index in 3" :key="index" class="h-28 w-full rounded-xl" />
      </template>
      <template v-else>
        <ul v-if="shown > 0" class="flex flex-col gap-2.5" :aria-labelledby="`board-column-${column}`">
          <slot />
        </ul>
        <p v-else class="text-muted-foreground px-2 py-8 text-center text-sm">{{ t("admin.boardView.empty") }}</p>
        <Button v-if="hasMore" type="button" variant="ghost" size="sm" :loading="loadingMore" data-slot="board-show-more" @click="emit('more')">
          {{ moreFailed ? t("admin.shell.retry") : t("admin.boardView.showMore", { count: number(remaining) }) }}
        </Button>
      </template>
    </div>
  </section>
</template>
