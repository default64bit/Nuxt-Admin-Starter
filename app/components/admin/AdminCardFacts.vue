<script setup lang="ts">
import { cn } from "@/lib/utils";
import type { AdminCardFact } from "./admin-list-view";

// The labelled values of an admin card as a definition list. `inline` runs them along one line (row cards), `grid`
// stacks label over value in two columns, `list` puts the label at the start and the value at the end of each line.
defineProps<{ facts: AdminCardFact[]; layout: "inline" | "grid" | "list" }>();
const wrap = { inline: "flex flex-wrap gap-x-4 gap-y-0.5", grid: "grid grid-cols-2 gap-x-4 gap-y-2", list: "grid gap-1" };
const item = { inline: "flex items-baseline gap-1", grid: "flex min-w-0 flex-col", list: "flex items-baseline justify-between gap-3" };
</script>

<template>
  <dl :class="cn('text-xs', wrap[layout])" data-slot="card-facts">
    <div v-for="fact in facts" :key="fact.label" :class="item[layout]">
      <dt class="text-muted-foreground shrink-0">{{ fact.label }}</dt>
      <dd :class="cn('min-w-0 tabular-nums', layout === 'list' && 'text-end')">
        <span :dir="fact.ltr ? 'ltr' : undefined">{{ fact.value }}</span>
        <span v-if="fact.hint" :class="cn('text-muted-foreground', layout === 'inline' ? 'ms-1' : 'block')">{{ fact.hint }}</span>
      </dd>
    </div>
  </dl>
</template>
