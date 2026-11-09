<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { createCalendar, getLocalTimeZone, parseDate, toCalendar, today } from '@internationalized/date'
import { IconCalendar } from '@tabler/icons-vue'
import { useAttrs } from 'vue'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ default: '' })

const props = defineProps<{
  placeholder?: string
}>()

const emit = defineEmits<{
  blur: [event: Event]
}>()

const attrs = useAttrs()
const { locale } = useI18n()
const open = ref(false)

const calendarId = computed(() => locale.value === 'fa' ? 'persian' : 'gregory')
const dateLocale = computed(() => locale.value === 'fa' ? 'fa-IR' : 'en')

function inCalendar(value: DateValue) {
  return toCalendar(value, createCalendar(calendarId.value))
}

const selected = computed(() => {
  if (!model.value) return undefined
  try {
    return inCalendar(parseDate(model.value))
  }
  catch {
    return undefined
  }
})

const placeholderDate = shallowRef<DateValue>(inCalendar(today(getLocalTimeZone())))

watch(calendarId, () => {
  placeholderDate.value = selected.value ?? inCalendar(today(getLocalTimeZone()))
})

watch(selected, (value) => {
  if (value) placeholderDate.value = value
})

const formatted = computed(() => {
  if (!selected.value) return ''
  return new Intl.DateTimeFormat(dateLocale.value, {
    calendar: calendarId.value,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(selected.value.toDate(getLocalTimeZone()))
})

function choose(value: DateValue | undefined) {
  model.value = value ? toCalendar(value, createCalendar('gregory')).toString() : ''
  open.value = false
}

watch(open, (isOpen) => {
  if (!isOpen) emit('blur', new FocusEvent('blur'))
})
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        v-bind="attrs"
        :class="cn('w-full justify-start text-start font-normal', !formatted && 'text-muted-foreground/70')"
      >
        <IconCalendar class="size-4" />
        {{ formatted || props.placeholder }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0">
      <Calendar
        :key="calendarId"
        :locale="dateLocale"
        :calendar-label="props.placeholder"
        :model-value="selected"
        v-model:placeholder="placeholderDate"
        @update:model-value="choose"
      />
    </PopoverContent>
  </Popover>
</template>
