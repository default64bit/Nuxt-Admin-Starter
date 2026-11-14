<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { IconX } from '@tabler/icons-vue'
import { reactiveOmit } from '@vueuse/core'
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import DialogOverlay from './DialogOverlay.vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<DialogContentProps & {
  class?: HTMLAttributes['class']
  showCloseButton?: boolean
}>(), {
  showCloseButton: true,
})
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'showCloseButton')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      data-slot="dialog-content"
      :class="cn(
        'bg-popover text-popover-foreground fixed inset-x-0 top-1/2 z-50 mx-auto grid w-full max-w-[calc(100%-2rem)] -translate-y-1/2 gap-4 rounded-xl p-4 text-sm shadow-lg duration-200 outline-none sm:max-w-sm',
        'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
        props.class,
      )"
      v-bind="{ ...$attrs, ...forwarded }"
    >
      <slot />

      <DialogClose
        v-if="showCloseButton"
        data-slot="dialog-close"
        as-child
      >
        <Button
          variant="ghost"
          class="absolute inset-bs-4 inset-e-4"
          size="icon-sm"
        >
          <IconX />
          <span class="sr-only">Close</span>
        </Button>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
