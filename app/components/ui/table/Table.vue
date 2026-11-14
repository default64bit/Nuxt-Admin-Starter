<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

// Correctness patch to a base primitive (ADR-0012): the container scrolls horizontally on small
// screens, and a scrollable region with nothing focusable inside is unreachable by keyboard. With
// `scrollLabel` the region becomes a labelled, focusable `region` (tables whose rows hold no links or buttons).
const props = defineProps<{
  class?: HTMLAttributes["class"]
  scrollLabel?: string
}>()
</script>

<template>
  <div
    data-slot="table-container"
    class="relative w-full overflow-auto"
    :tabindex="scrollLabel ? 0 : undefined"
    :role="scrollLabel ? 'region' : undefined"
    :aria-label="scrollLabel"
  >
    <table data-slot="table" :class="cn('w-full caption-bottom text-sm', props.class)">
      <slot />
    </table>
  </div>
</template>
