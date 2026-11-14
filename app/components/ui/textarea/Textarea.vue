<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
  defaultValue?: string | number
  modelValue?: string | number
  dir?: 'auto' | 'ltr' | 'rtl'
}>(), {
  dir: 'auto',
})

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void
}>()

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue,
})

const { localeProperties } = useI18n()
const textDirection = computed(() => {
  if (props.dir !== 'auto') return props.dir
  if (String(modelValue.value ?? '') !== '') return 'auto'
  return localeProperties.value.dir === 'rtl' ? 'rtl' : 'ltr'
})
</script>

<template>
  <textarea
    v-model="modelValue"
    data-slot="textarea"
    :dir="textDirection"
    :class="cn('border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-md border bg-transparent px-2.5 py-2 text-base shadow-xs transition-[color,box-shadow] focus-visible:ring-3 aria-invalid:ring-3 md:text-sm flex field-sizing-content min-h-16 w-full outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50', props.class)"
  />
</template>
