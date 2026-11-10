<script setup lang="ts">
// The frame of an admin Board (ADR-0027): the columns in the shadcn Carousel (an RTL-aware column carousel on small
// screens), a hint line and Previous/Next controls. While a card is held near the board's edge or over Previous/Next,
// the carousel slides one column at a time. The page owns the data and the moves: the `column` slot draws one
// column and receives the key of the column a card is being dragged from (`null` when nothing is dragged).
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import type { UnwrapRefCarouselApi } from "@/components/ui/carousel/interface";
import { edgeSlide } from "~~/shared/utils/board-edge-slide";
import { BOARD_CARD_KIND, keepHandleDrag, swipeUnlessHandle } from "./board-drag";

const props = defineProps<{ columns: readonly string[]; label: string; hint: string; hidden?: boolean }>();
defineSlots<{ column(props: { column: string; dragFrom: string | null }): unknown }>();
const { t, locale } = useI18n();
const dir = computed<"rtl" | "ltr">(() => (locale.value === "en" ? "ltr" : "rtl"));

const api = ref<UnwrapRefCarouselApi>();
const viewport = ref<HTMLElement | null>(null);
const prevZone = ref<HTMLElement | null>(null);
const nextZone = ref<HTMLElement | null>(null);
const dragFrom = ref<string | null>(null);
const carouselOpts = computed(() => ({ align: "start" as const, containScroll: "trimSnaps" as const, direction: dir.value, watchDrag: swipeUnlessHandle }));

/** Slides the carousel so `column` is in view (after a card lands there). */
function showColumn(column: string) {
  const index = props.columns.indexOf(column);
  if (api.value && index >= 0 && !api.value.slidesInView().includes(index)) api.value.scrollTo(index);
}
defineExpose({ showColumn });

const SLIDE_EVERY_MS = 550;
let lastSlide = 0;
let zoneTimer: ReturnType<typeof setInterval> | undefined;
const slide = (direction: "prev" | "next") => (direction === "prev" ? api.value?.scrollPrev() : api.value?.scrollNext());
const stopZone = () => {
  clearInterval(zoneTimer);
  zoneTimer = undefined;
};
const startZone = (direction: "prev" | "next") => {
  stopZone();
  slide(direction);
  zoneTimer = setInterval(() => slide(direction), SLIDE_EVERY_MS);
};

let cleanup: (() => void) | undefined;
onMounted(() => {
  viewport.value?.addEventListener("dragstart", keepHandleDrag, true);
  const isCard = ({ source }: { source: { data: Record<string | symbol, unknown> } }) => source.data.kind === BOARD_CARD_KIND;
  const parts = [
    () => viewport.value?.removeEventListener("dragstart", keepHandleDrag, true),
    monitorForElements({
      canMonitor: isCard,
      onDragStart: ({ source }) => (dragFrom.value = String(source.data.column)),
      onDrag: ({ location }) => {
        const rect = viewport.value?.getBoundingClientRect();
        if (!rect || Date.now() - lastSlide < SLIDE_EVERY_MS) return;
        const direction = edgeSlide(location.current.input.clientX, rect, dir.value, Math.min(96, rect.width / 6));
        if (!direction) return;
        lastSlide = Date.now();
        slide(direction);
      },
      onDrop: () => {
        dragFrom.value = null;
        stopZone();
      },
    }),
  ];
  for (const [element, direction] of [
    [prevZone.value, "prev"],
    [nextZone.value, "next"],
  ] as const) {
    if (element) parts.push(dropTargetForElements({ element, canDrop: isCard, onDragEnter: () => startZone(direction), onDragLeave: stopZone, onDrop: stopZone }));
  }
  cleanup = combine(...parts);
});
onBeforeUnmount(() => {
  cleanup?.();
  stopZone();
});
</script>

<template>
  <Carousel v-show="!hidden" :opts="carouselOpts" class="flex flex-col gap-3" data-slot="admin-board" :aria-label="label" @init-api="(value) => (api = value)">
    <div class="flex items-center gap-2">
      <p class="text-muted-foreground text-sm">{{ hint }}</p>
      <div class="ms-auto flex shrink-0 gap-1">
        <span ref="prevZone" class="inline-flex rounded-full p-1 transition-colors" :class="dragFrom ? 'bg-primary/10 ring-primary/40 ring-1' : ''">
          <CarouselPrevious class="static translate-y-0">
            <ChevronLeftIcon class="rtl:rotate-180" aria-hidden="true" />
            <span class="sr-only">{{ t("admin.boardView.previous") }}</span>
          </CarouselPrevious>
        </span>
        <span ref="nextZone" class="inline-flex rounded-full p-1 transition-colors" :class="dragFrom ? 'bg-primary/10 ring-primary/40 ring-1' : ''">
          <CarouselNext class="static translate-y-0">
            <ChevronRightIcon class="rtl:rotate-180" aria-hidden="true" />
            <span class="sr-only">{{ t("admin.boardView.next") }}</span>
          </CarouselNext>
        </span>
      </div>
    </div>
    <div ref="viewport">
      <CarouselContent class="-ms-3 py-1">
        <CarouselItem v-for="column in columns" :key="column" class="basis-[85%] ps-3 sm:basis-[320px]">
          <slot name="column" :column="column" :drag-from="dragFrom" />
        </CarouselItem>
      </CarouselContent>
    </div>
  </Carousel>
</template>
