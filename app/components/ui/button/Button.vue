<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '.'
import { IconLoader2 } from '@tabler/icons-vue'
import { Primitive } from 'reka-ui'
import { cn } from '@/lib/utils'
import { buttonVariants } from '.'

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
  /** Keeps the label in layout and overlays a spinner so the button never changes size while a request runs. */
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
})
</script>

<template>
  <Primitive
    data-slot="button"
    :data-variant="variant"
    :data-size="size"
    :as="as"
    :as-child="asChild"
    :disabled="loading || undefined"
    :aria-busy="loading ? 'true' : undefined"
    :class="cn(buttonVariants({ variant, size }), loading && 'relative', props.class)"
  >
    <template v-if="loading && !asChild">
      <span data-slot="button-label" class="invisible inline-flex items-center justify-center gap-[inherit]"><slot /></span>
      <IconLoader2 data-slot="button-spinner" aria-hidden="true" class="absolute size-4 animate-spin" />
    </template>
    <slot v-else />
  </Primitive>
</template>
