<script setup lang="ts">
import { InputOTP } from "@/components/ui/input-otp";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";
import { normalizeDigits } from "~~/shared/utils/phone";

// Five left-to-right boxes over an ASCII model. Persian and Arabic-Indic digits are accepted when typed or pasted
// and shown in the locale's digits; nothing submits by itself (no auto-submit), so a mistyped paste cannot use up
// one of the ten attempts.
const props = defineProps<{
  modelValue: string;
  label: string;
  invalid?: boolean;
  readonly?: boolean;
  locale: "fa" | "en";
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const DIGIT_PATTERN = "^[0-9\\u06F0-\\u06F9\\u0660-\\u0669]*$";
const value = computed({
  get: () => props.modelValue,
  set: (next: string) => emit("update:modelValue", normalizeDigits(next ?? "").replace(/\s/g, "")),
});
const transform = (text: string | undefined) => normalizeDigits(text ?? "").replace(/\s/g, "");

const root = ref<HTMLElement | null>(null);
defineExpose({ focus: () => root.value?.querySelector("input")?.focus() });
</script>

<template>
  <div ref="root" dir="ltr" data-slot="otp-field">
    <InputOTP
      v-model="value"
      :maxlength="5"
      :pattern="DIGIT_PATTERN"
      :paste-transformer="transform"
      inputmode="numeric"
      autocomplete="one-time-code"
      :aria-label="label"
      :aria-invalid="invalid ? 'true' : undefined"
      :disabled="readonly"
      class="w-full justify-center"
    >
      <template #default="{ slots }">
        <div
          v-for="(slot, index) in slots"
          :key="index"
          data-slot="otp-box"
          :data-active="slot.isActive"
          :aria-invalid="invalid ? 'true' : undefined"
          class="border-input bg-background text-foreground data-[active=true]:border-ring data-[active=true]:ring-ring/50 aria-invalid:border-destructive relative grid size-11 place-items-center rounded-md border text-xl font-medium shadow-xs outline-none data-[active=true]:ring-3 sm:h-12 sm:w-11"
        >
          {{ slot.char ? toLocaleDigits(slot.char, locale) : "" }}
          <span v-if="slot.hasFakeCaret" class="animate-caret-blink bg-foreground pointer-events-none absolute h-5 w-px" />
        </div>
      </template>
    </InputOTP>
  </div>
</template>
