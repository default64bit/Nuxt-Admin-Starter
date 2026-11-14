<script setup lang="ts">
import type { PopoverRootEmits, PopoverRootProps } from 'reka-ui'
import { PopoverRoot, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<PopoverRootProps>()
const emits = defineEmits<PopoverRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <PopoverRoot
    v-slot="slotProps"
    data-slot="popover"
    v-bind="forwarded"
  >
    <!-- Popovers are non-modal in Reka, so the page behind would still scroll. -->
    <ScrollLock :locked="slotProps.open" />
    <slot v-bind="slotProps" />
  </PopoverRoot>
</template>
