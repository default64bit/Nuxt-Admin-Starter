<script setup lang="ts">
import type { HTMLAttributes, Ref } from 'vue'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { TooltipProvider } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { cn } from '@/lib/utils'
import { isSidebarShortcut } from '~~/shared/utils/sidebar-shortcut'
import { provideSidebarContext, SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME, SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON } from './utils'

const sidebarOpenCookie = useCookie<string | null>(SIDEBAR_COOKIE_NAME, {
  maxAge: SIDEBAR_COOKIE_MAX_AGE,
  sameSite: 'lax',
  default: () => null,
  decode: (value) => value ?? null,
  encode: (value) => value ?? '',
})

const props = withDefaults(defineProps<{
  defaultOpen?: boolean
  open?: boolean
  class?: HTMLAttributes['class']
}>(), {
  open: undefined,
  defaultOpen: undefined,
})

const emits = defineEmits<{
  'update:open': [open: boolean]
}>()

const isMobile = useMediaQuery('(max-width: 768px)', { ssrWidth: 1024 })
const openMobile = ref(false)

function readOpenCookie() {
  if (sidebarOpenCookie.value == null || sidebarOpenCookie.value === '') {
    return props.defaultOpen ?? true
  }
  return sidebarOpenCookie.value !== 'false'
}

const uncontrolledOpen = ref(readOpenCookie())

const open = computed({
  get: () => (props.open !== undefined ? props.open : uncontrolledOpen.value),
  set: (value: boolean) => {
    emits('update:open', value)
    uncontrolledOpen.value = value
  },
}) as Ref<boolean>

watch(
  uncontrolledOpen,
  (value) => {
    if (props.open !== undefined) return
    sidebarOpenCookie.value = value ? 'true' : 'false'
  },
  { flush: 'post' },
)

function setOpen(value: boolean) {
  open.value = value
}

function setOpenMobile(value: boolean) {
  openMobile.value = value
}

function toggleSidebar() {
  return isMobile.value ? setOpenMobile(!openMobile.value) : setOpen(!open.value)
}

// Patched generated primitive (ADR-0012 allows correctness edits): match the physical B key
// (`event.code`) so the shortcut works on a Persian layout, and ignore editable targets so inputs and
// rich-text editors keep Ctrl+B. The decision lives in a shared, unit-tested helper.
useEventListener('keydown', (event: KeyboardEvent) => {
  if (isSidebarShortcut(event)) {
    event.preventDefault()
    toggleSidebar()
  }
})

const state = computed(() => (open.value ? 'expanded' : 'collapsed'))

provideSidebarContext({
  state,
  open,
  setOpen,
  isMobile,
  openMobile,
  setOpenMobile,
  toggleSidebar,
})
</script>

<template>
  <TooltipProvider :delay-duration="0">
    <div
      data-slot="sidebar-wrapper"
      :style="{
        '--sidebar-width': SIDEBAR_WIDTH,
        '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
      }"
      :class="cn('group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full', props.class)"
      v-bind="$attrs"
    >
      <slot />
    </div>
  </TooltipProvider>
</template>
