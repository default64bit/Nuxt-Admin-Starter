<script setup lang="ts">
import type { DateValue } from "@internationalized/date";
import { createCalendar, parseDate, toCalendar } from "@internationalized/date";
import { IconCalendar } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatTimeText, joinInstant, parseTimeText, splitInstant, tehranToday } from "~~/shared/utils/tehran-time";

// A date and a 24-hour time for admin forms, read in Asia/Tehran and stored as one UTC instant. The
// model is that instant as ISO text ("" while empty or incomplete): the same value means the same moment
// in every browser time zone. The calendar is Persian in `fa` and Gregorian in `en`; digits follow the
// locale. The date-only `ui/date-picker` is a separate component and is not changed by this one.
const props = withDefaults(defineProps<{
  modelValue?: string;
  /** Names the whole control for assistive technology (for example "Start"). */
  label: string;
  dateLabel: string;
  timeLabel: string;
  invalid?: boolean;
  disabled?: boolean;
}>(), { modelValue: "", invalid: false, disabled: false });
const emit = defineEmits<{ "update:modelValue": [value: string]; blur: [] }>();

const { locale } = useI18n();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const calendarId = computed(() => (locale.value === "fa" ? "persian" : "gregory"));
const dateLocale = computed(() => (locale.value === "fa" ? "fa-IR" : "en-GB"));
const open = ref(false);

// The two halves are kept apart so a half-typed time does not lose the chosen date.
const date = ref("");
const timeText = ref("");

function readModel(value: string) {
  if (!value) {
    date.value = "";
    timeText.value = "";
    return;
  }
  const parts = splitInstant(value);
  date.value = parts.date;
  const clock = parseTimeText(parts.time)!;
  timeText.value = formatTimeText(clock.hour, clock.minute, digits.value);
}
readModel(props.modelValue);
// An outside change replaces both halves, unless it is what this control just emitted.
watch(() => props.modelValue, (value) => {
  if (value !== (joinInstant(date.value, timeText.value) ?? "")) readModel(value);
});
// A locale switch only changes how the time is spelled.
watch(digits, () => {
  const clock = parseTimeText(timeText.value);
  if (clock) timeText.value = formatTimeText(clock.hour, clock.minute, digits.value);
});

function commit() {
  emit("update:modelValue", joinInstant(date.value, timeText.value) ?? "");
}

const toCalendarValue = (text: string): DateValue | undefined => {
  try {
    return toCalendar(parseDate(text), createCalendar(calendarId.value));
  } catch {
    return undefined;
  }
};
const selected = computed(() => (date.value ? toCalendarValue(date.value) : undefined));
const placeholderDate = shallowRef<DateValue>(selected.value ?? toCalendarValue(tehranToday())!);
watch(calendarId, () => (placeholderDate.value = selected.value ?? toCalendarValue(tehranToday())!));
watch(selected, (value) => value && (placeholderDate.value = value));

// The date is shown from its own digits at midday UTC, so no time zone can move it.
const formattedDate = computed(() => {
  if (!date.value) return "";
  return new Intl.DateTimeFormat(dateLocale.value, { calendar: calendarId.value, day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date.value}T12:00:00Z`));
});

function choose(value: DateValue | undefined) {
  if (!value) return;
  date.value = toCalendar(value, createCalendar("gregory")).toString();
  // A date picked before any time starts the day at 00:00.
  if (!parseTimeText(timeText.value)) timeText.value = formatTimeText(0, 0, digits.value);
  open.value = false;
  commit();
}

function onTimeInput(value: string | number) {
  timeText.value = String(value);
  commit();
}
// Leaving the field tidies a valid time (`9:5` is not valid; `0905` becomes `09:05`).
function onTimeBlur() {
  const clock = parseTimeText(timeText.value);
  if (clock) timeText.value = formatTimeText(clock.hour, clock.minute, digits.value);
  emit("blur");
}
const timeInvalid = computed(() => Boolean(timeText.value) && !parseTimeText(timeText.value));
watch(open, (isOpen) => !isOpen && emit("blur"));
</script>

<template>
  <div role="group" :aria-label="label" data-slot="admin-date-time-input" class="flex w-full items-center gap-2">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          type="button"
          variant="outline"
          data-slot="date-trigger"
          :disabled="disabled"
          :aria-label="formattedDate ? `${dateLabel}: ${formattedDate}` : dateLabel"
          :aria-invalid="invalid || undefined"
          :class="cn('min-w-0 flex-1 justify-start text-start font-normal', !formattedDate && 'text-muted-foreground/70')"
        >
          <IconCalendar class="size-4 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ formattedDate || dateLabel }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0">
        <Calendar
          :key="calendarId"
          v-model:placeholder="placeholderDate"
          :locale="dateLocale"
          :calendar-label="dateLabel"
          :model-value="selected"
          @update:model-value="choose"
        />
      </PopoverContent>
    </Popover>
    <Input
      data-slot="time-input"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      dir="ltr"
      :disabled="disabled"
      :aria-label="timeLabel"
      :aria-invalid="invalid || timeInvalid || undefined"
      :model-value="timeText"
      placeholder="00:00"
      maxlength="5"
      class="w-24 shrink-0 text-center tabular-nums"
      @update:model-value="onTimeInput"
      @blur="onTimeBlur"
    />
  </div>
</template>
