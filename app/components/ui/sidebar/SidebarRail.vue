<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { useSidebar } from './utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { toggleSidebar } = useSidebar()
</script>

<template>
  <button
    data-sidebar="rail"
    data-slot="sidebar-rail"
    aria-label="Toggle Sidebar"
    :tabindex="-1"
    title="Toggle Sidebar"
    :class="cn(
      'hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear after:absolute after:inset-y-0 after:start-1/2 after:w-0.5 sm:flex',
      'group-data-[side=start]:-end-2 group-data-[side=end]:-start-2',
      'in-data-[side=start]:cursor-w-resize rtl:in-data-[side=start]:cursor-e-resize in-data-[side=end]:cursor-e-resize rtl:in-data-[side=end]:cursor-w-resize',
      '[[data-side=start][data-state=collapsed]_&]:cursor-e-resize rtl:[[data-side=start][data-state=collapsed]_&]:cursor-w-resize [[data-side=end][data-state=collapsed]_&]:cursor-w-resize rtl:[[data-side=end][data-state=collapsed]_&]:cursor-e-resize',
      'group-data-[collapsible=offcanvas]:after:start-full hover:group-data-[collapsible=offcanvas]:bg-sidebar',
      '[[data-side=start][data-collapsible=offcanvas]_&]:-end-2',
      '[[data-side=end][data-collapsible=offcanvas]_&]:-start-2',
      props.class,
    )"
    @click="toggleSidebar"
  >
    <slot />
  </button>
</template>
