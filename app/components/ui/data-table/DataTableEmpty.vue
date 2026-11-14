<script setup lang="ts">
import { IconTable } from '@tabler/icons-vue'

defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <div class="flex min-h-72 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
    <div class="bg-muted text-muted-foreground mb-2 flex size-10 items-center justify-center rounded-lg">
      <slot name="icon">
        <IconTable class="size-4" />
      </slot>
    </div>
    <p class="text-sm font-medium">
      {{ title }}
    </p>
    <p class="text-muted-foreground max-w-sm text-sm text-balance">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-3">
      <slot />
    </div>
  </div>
</template>
