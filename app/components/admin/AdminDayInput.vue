<script setup lang="ts">
import type { DateValue } from "@internationalized/date";
import { createCalendar, parseDate, toCalendar } from "@internationalized/date";
import { IconCalendar, IconX } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { tehranToday } from "~~/shared/utils/tehran-time";

// A calendar day for admin filters, read in Asia/Tehran. The model is the Gregorian `YYYY-MM-DD` of that day
// ("" while empty). The calendar is Persian in `fa` and Gregorian in `en`, digits follow the locale: the day
// half of `AdminDateTimeInput` with a Clear button and no time.
const props = defineProps<{ modelValue?: string; label: string; placeholder: string; clearLabel: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const { locale } = useI18n();
const calendarId = computed(() => (locale.value === "fa" ? "persian" : "gregory"));
const dateLocale = computed(() => (locale.value === "fa" ? "fa-IR" : "en-GB"));
const open = ref(false);

const toCalendarValue = (text: string): DateValue | undefined => {
  try {
    return toCalendar(parseDate(text), createCalendar(calendarId.value));
  } catch {
    return undefined;
  }
};
const selected = computed(() => (props.modelValue ? toCalendarValue(props.modelValue) : undefined));
const placeholderDate = shallowRef<DateValue>(selected.value ?? toCalendarValue(tehranToday())!);
watch(calendarId, () => (placeholderDate.value = selected.value ?? toCalendarValue(tehranToday())!));
watch(selected, (value) => value && (placeholderDate.value = value));

// Shown from its own digits at midday UTC, so no time zone can move the day.
const formatted = computed(() => {
  if (!props.modelValue || !selected.value) return "";
  return new Intl.DateTimeFormat(dateLocale.value, { calendar: calendarId.value, day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${props.modelValue}T12:00:00Z`));
});

function choose(value: DateValue | undefined) {
  if (!value) return;
  emit("update:modelValue", toCalendar(value, createCalendar("gregory")).toString());
  open.value = false;
}
</script>

<template>
  <div role="group" :aria-label="label" data-slot="admin-day-input" class="flex items-center gap-1">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button type="button" variant="outline" data-slot="day-trigger" :aria-label="formatted ? `${label}: ${formatted}` : label" :class="cn('min-w-36 justify-start text-start font-normal', !formatted && 'text-muted-foreground')">
          <IconCalendar class="size-4 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ formatted || placeholder }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0">
        <Calendar :key="calendarId" v-model:placeholder="placeholderDate" :locale="dateLocale" :calendar-label="label" :model-value="selected" @update:model-value="choose" />
      </PopoverContent>
    </Popover>
    <Button v-if="modelValue" type="button" variant="ghost" size="icon" data-slot="day-clear" :aria-label="clearLabel" @click="emit('update:modelValue', '')">
      <IconX class="size-4" aria-hidden="true" />
    </Button>
  </div>
</template>
