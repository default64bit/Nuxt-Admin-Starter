<script setup lang="ts">
import { cn } from "@/lib/utils";
import { ADMIN_TINT_CLASS } from "~/components/admin/admin-nav-icons";
import AdminCardFacts from "./AdminCardFacts.vue";
import type { AdminCardFact } from "./admin-list-view";

// A one-line admin card (the "rows" layout of AdminCardList): an optional tinted media tile at the start, the name
// with its badges and the facts in the middle, and the record's actions at the end. `code` shows the title in
// monospace, left to right. `leading` comes before the media tile and the default slot is a body under the title.
defineProps<{ title: string; subtitle?: string; code?: boolean; facts: AdminCardFact[] }>();
</script>

<template>
  <article data-slot="row-card" class="bg-card text-card-foreground flex w-full min-w-0 items-center gap-3 rounded-lg border p-3">
    <slot name="leading" />
    <div v-if="$slots.media" :class="cn(ADMIN_TINT_CLASS, 'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md')">
      <slot name="media" />
    </div>
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h2 :dir="code ? 'ltr' : undefined" :class="cn('truncate text-sm font-medium', code && 'font-mono')">{{ title }}</h2>
        <span v-if="subtitle" class="text-muted-foreground truncate text-xs">{{ subtitle }}</span>
        <slot name="badges" />
      </div>
      <slot />
      <AdminCardFacts v-if="facts.length" :facts="facts" layout="inline" />
    </div>
    <div v-if="$slots.actions" class="shrink-0"><slot name="actions" /></div>
  </article>
</template>
