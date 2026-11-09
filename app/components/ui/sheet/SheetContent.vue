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
import SheetOverlay from './SheetOverlay.vue'

interface SheetContentProps extends DialogContentProps {
  class?: HTMLAttributes['class']
  side?: 'top' | 'end' | 'bottom' | 'start'
  showCloseButton?: boolean
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<SheetContentProps>(), {
  side: 'end',
  showCloseButton: true,
})
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'side', 'showCloseButton')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <SheetOverlay />
    <DialogContent
      data-slot="sheet-content"
      :data-side="side"
      :class="cn(
        'bg-popover text-popover-foreground fixed z-50 flex flex-col gap-4 bg-clip-padding text-sm shadow-lg transition duration-200 ease-in-out',
        'data-[side=bottom]:inset-x-0 data-[side=bottom]:inset-be-0 data-[side=bottom]:h-auto data-[side=bottom]:border-bs',
        'data-[side=top]:inset-x-0 data-[side=top]:inset-bs-0 data-[side=top]:h-auto data-[side=top]:border-be',
        'data-[side=start]:inset-y-0 data-[side=start]:start-0 data-[side=start]:h-full data-[side=start]:w-3/4 data-[side=start]:border-e data-[side=start]:sm:max-w-sm',
        'data-[side=end]:inset-y-0 data-[side=end]:end-0 data-[side=end]:h-full data-[side=end]:w-3/4 data-[side=end]:border-s data-[side=end]:sm:max-w-sm',
        'data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        'data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=bottom]:data-closed:slide-out-to-bottom-10',
        'data-[side=top]:data-open:slide-in-from-top-10 data-[side=top]:data-closed:slide-out-to-top-10',
        'ltr:data-[side=start]:data-open:slide-in-from-left-10 rtl:data-[side=start]:data-open:slide-in-from-right-10',
        'ltr:data-[side=start]:data-closed:slide-out-to-left-10 rtl:data-[side=start]:data-closed:slide-out-to-right-10',
        'ltr:data-[side=end]:data-open:slide-in-from-right-10 rtl:data-[side=end]:data-open:slide-in-from-left-10',
        'ltr:data-[side=end]:data-closed:slide-out-to-right-10 rtl:data-[side=end]:data-closed:slide-out-to-left-10',
        props.class,
      )"
      v-bind="{ ...$attrs, ...forwarded }"
    >
      <slot />

      <DialogClose
        v-if="showCloseButton"
        data-slot="sheet-close"
        as-child
      >
        <Button variant="ghost" class="absolute inset-bs-4 end-4" size="icon-sm">
          <IconX />
          <span class="sr-only">Close</span>
        </Button>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
