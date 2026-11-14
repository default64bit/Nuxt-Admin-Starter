<script setup lang="ts">
import OtpField from "~/components/auth/OtpField.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";

// The phone and code steps of sign-in. Every state is presented inline, never as a toast.
const { t, locale } = useI18n();
const flow = useSignInFlow();
const digitLocale = computed(() => (locale.value === "en" ? "en" : "fa"));

// The page owns the heading. The code step replaces the generic heading with its own title and sub-text, so
// they are reported, not repeated here.
const emit = defineEmits<{ heading: [heading: { title: string; description: string }] }>();
const heading = computed(() =>
  flow.step.value === "code"
    ? { title: t("auth.signIn.code.title"), description: t("auth.signIn.code.sentTo", { phone: flow.phoneForDisplay.value }) }
    : { title: t("auth.signIn.title"), description: t("auth.signIn.description") },
);
watch(heading, (value) => emit("heading", value), { immediate: true });

const phoneInputEl = useTemplateRef<{ $el: HTMLInputElement }>("phoneInputEl");
const otpField = useTemplateRef<{ focus: () => void }>("otpField");

const phoneError = computed(() => {
  if (flow.rateLimitedNow.value || flow.error.value === "rate_limited") {
    return t("auth.signIn.phone.rateLimited", { minutes: toLocaleDigits(String(flow.rateLimitedMinutes.value), digitLocale.value) });
  }
  if (flow.phoneInvalid.value || flow.phoneEmptyAfterTouch.value || flow.error.value === "invalid_phone") return t("auth.signIn.phone.invalid");
  return null;
});
const transportError = computed(() => {
  if (flow.error.value === "sms_unavailable") return t("auth.signIn.errors.sms");
  if (flow.error.value === "network") return t("auth.signIn.errors.network");
  if (flow.error.value === "generic") return t("auth.signIn.errors.generic");
  return null;
});

function reload() {
  if (import.meta.client) window.location.reload();
}

function onPhoneInput(value: string | number) {
  flow.setPhoneInput(String(value));
}

onMounted(() => {
  flow.restore();
  nextTick(() => (flow.step.value === "code" ? otpField.value?.focus() : phoneInputEl.value?.$el.focus()));
});

watch(
  () => flow.step.value,
  (step) => nextTick(() => (step === "code" ? otpField.value?.focus() : step === "phone" ? phoneInputEl.value?.$el.focus() : undefined)),
);
// A wrong code clears the boxes: put focus back on the first one.
watch(
  () => flow.error.value,
  (error) => {
    if (error === "incorrect") nextTick(() => otpField.value?.focus());
  },
);
</script>

<template>
  <form class="flex flex-col gap-4" :aria-busy="flow.busy.value" novalidate data-testid="sign-in-form" @submit.prevent="flow.step.value === 'code' ? flow.verifyCode() : flow.sendCode()">
    <!-- Phone step -->
    <template v-if="flow.step.value === 'phone'">
      <div class="flex flex-col gap-2">
        <Label for="signin-phone">{{ t("auth.signIn.phone.label") }}</Label>
        <Input
          id="signin-phone"
          ref="phoneInputEl"
          :model-value="flow.phoneDisplay.value"
          type="tel"
          inputmode="tel"
          autocomplete="tel-national"
          dir="ltr"
          :placeholder="t('auth.signIn.phone.placeholder')"
          :readonly="flow.busy.value"
          :aria-invalid="phoneError ? 'true' : undefined"
          :aria-describedby="phoneError ? 'signin-phone-error' : undefined"
          class="h-10 text-start"
          @update:model-value="onPhoneInput"
          @blur="flow.phoneTouched.value = true"
        />
        <p v-if="phoneError" id="signin-phone-error" class="text-destructive text-sm" role="alert">{{ phoneError }}</p>
      </div>
      <p v-if="transportError" class="text-destructive text-sm" role="alert">{{ transportError }}</p>
      <Button v-if="flow.error.value === 'generic'" type="button" variant="link" class="self-start px-0" data-slot="reload" @click="reload()">{{ t("auth.signIn.errors.reload") }}</Button>
      <Button type="submit" size="lg" class="w-full" :disabled="flow.busy.value || flow.rateLimitedNow.value">
        {{ t("auth.signIn.phone.continue") }}
      </Button>
    </template>

    <!-- Code step -->
    <template v-else-if="flow.step.value === 'code'">
      <OtpField ref="otpField" v-model="flow.code.value" :label="t('auth.signIn.code.label')" :invalid="flow.error.value === 'incorrect'" :readonly="flow.busy.value" :locale="digitLocale" />
      <p v-if="flow.resentSameCode.value" class="text-muted-foreground text-center text-xs" role="status" data-slot="resent-notice">{{ t("auth.signIn.code.resentSame") }}</p>
      <p v-if="flow.testCodeFilled.value" class="text-muted-foreground text-center text-xs" data-slot="test-mode-notice">{{ t("auth.signIn.code.testMode") }}</p>
      <p v-if="flow.error.value === 'incorrect'" class="text-destructive text-center text-sm" role="alert">{{ t("auth.signIn.code.wrong") }}</p>
      <p v-if="transportError" class="text-destructive text-center text-sm" role="alert">{{ transportError }}</p>
      <Button v-if="flow.error.value === 'generic'" type="button" variant="link" data-slot="reload" @click="reload()">{{ t("auth.signIn.errors.reload") }}</Button>
      <Button type="submit" size="lg" class="w-full" :disabled="flow.busy.value || flow.code.value.length !== 5">
        {{ t("auth.signIn.code.continue") }}
      </Button>
      <div class="flex flex-col items-center gap-1">
        <Button type="button" variant="ghost" size="sm" :disabled="flow.resendSeconds.value > 0 || flow.busy.value" @click="flow.resend()">
          {{
            flow.resendSeconds.value > 0
              ? t("auth.signIn.code.resendIn", { seconds: toLocaleDigits(String(flow.resendSeconds.value), digitLocale) })
              : t("auth.signIn.code.resend")
          }}
        </Button>
        <Button type="button" variant="ghost" size="sm" @click="flow.changeNumber()">{{ t("auth.signIn.code.useDifferent") }}</Button>
      </div>
    </template>

    <!-- Expired and too-many-attempts states -->
    <template v-else>
      <div class="flex flex-col gap-1 text-center" role="alert">
        <h2 class="text-base font-semibold">{{ t(`auth.signIn.${flow.step.value}.title`) }}</h2>
        <p class="text-muted-foreground text-sm">{{ t(`auth.signIn.${flow.step.value}.body`) }}</p>
      </div>
      <p v-if="transportError" class="text-destructive text-center text-sm" role="alert">{{ transportError }}</p>
      <Button type="button" size="lg" class="w-full" :disabled="flow.busy.value" @click="flow.sendNewCode()">
        {{ t(`auth.signIn.${flow.step.value}.cta`) }}
      </Button>
      <Button type="button" variant="ghost" size="sm" @click="flow.changeNumber()">{{ t("auth.signIn.code.useDifferent") }}</Button>
    </template>
  </form>
</template>
