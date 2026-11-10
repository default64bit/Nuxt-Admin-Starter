<script setup lang="ts">
import { IconSearch } from "@tabler/icons-vue";
import type { HTMLAttributes } from "vue";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// A search box with a leading magnifier, for the search bars of the admin pages. Everything except
// `class` (which sizes the whole box) goes to the input: `aria-label`, `placeholder`, `disabled`.
defineOptions({ inheritAttrs: false });
const props = defineProps<{ class?: HTMLAttributes["class"] }>();
const model = defineModel<string>({ default: "" });
</script>

<template>
  <div :class="cn('relative w-full', props.class)">
    <IconSearch class="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" aria-hidden="true" />
    <Input v-model="model" type="search" class="ps-8" v-bind="$attrs" />
  </div>
</template>
