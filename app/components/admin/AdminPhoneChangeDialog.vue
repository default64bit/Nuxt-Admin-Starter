<script setup lang="ts">
import OtpField from "~/components/auth/OtpField.vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePhoneChange } from "~/composables/admin/usePhoneChange";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";

// The phone-change dialog (users-and-roles spec, "My account"). Step one takes the new number (the account's own
// number is refused as soon as it is typed); step two takes the code with the sign-in page's resend, expiry,
// wrong-code and too-many-attempts states. A number that belongs to another account is only reported after the
// right code. Closing, with Esc or the button, discards the local state; the number changes on the server only once
// a correct code is verified.
const props = defineProps<{ currentPhone: string }>();
const open = defineModel<boolean>("open", { required: true });

const { t, locale } = useI18n();
const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
const flow = usePhoneChange(open, toRef(props, "currentPhone"));

const otpField = useTemplateRef<{ focus: () => void }>("otpField");
const phoneInputEl = useTemplateRef<{ $el: HTMLInputElement }>("phoneInputEl");

const heading = computed(() => {
  switch (flow.step.value) {
    case "code":
      return { title: t("admin.account.phoneChange.codeTitle"), description: t("auth.signIn.code.sentTo", { phone: flow.phoneForDisplay.value }) };
    case "expired":
    case "attempts":
      return { title: t(`auth.signIn.${flow.step.value}.title`), description: t(`auth.signIn.${flow.step.value}.body`) };
    case "in_use":
      return { title: t("admin.account.phoneChange.inUse.title"), description: t("admin.account.phoneChange.inUse.body") };
    default:
      return { title: t("admin.account.phoneChange.title"), description: t("admin.account.phoneChange.description") };
  }
});

const phoneError = computed(() => {
  if (flow.rateLimitedNow.value || flow.error.value === "rate_limited") {
    return t("auth.signIn.phone.rateLimited", { minutes: toLocaleDigits(String(flow.rateLimitedMinutes.value), digits.value) });
  }
  if (flow.isCurrent.value) return t("admin.account.phoneChange.current");
  if (flow.phoneInvalid.value || flow.error.value === "invalid") return t("auth.signIn.phone.invalid");
  return undefined;
});
const transportError = computed(() => {
  if (flow.error.value === "sms_unavailable") return t("auth.signIn.errors.sms");
  if (flow.error.value === "network") return t("auth.signIn.errors.network");
  if (flow.error.value === "generic") return t("auth.signIn.errors.generic");
  return null;
});

async function onSubmit() {
  if (flow.step.value === "code") {
    if ((await flow.verifyCode()) === "changed") open.value = false;
  } else if (flow.step.value === "phone") {
    await flow.sendCode();
  }
}

// Focus follows the step: the code boxes, then back to the phone field.
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
function reload() {
  if (import.meta.client) window.location.reload();
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent data-slot="phone-change" class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ heading.title }}</DialogTitle>
        <DialogDescription>{{ heading.description }}</DialogDescription>
      </DialogHeader>
      <form data-slot="phone-change-form" class="flex flex-col gap-4" :aria-busy="flow.busy.value || undefined" novalidate @submit.prevent="onSubmit">
        <!-- Step one: the new number -->
        <template v-if="flow.step.value === 'phone'">
          <div class="flex flex-col gap-2">
            <Label for="phone-change-phone">{{ t("admin.account.phoneChange.label") }}</Label>
            <Input
              id="phone-change-phone"
              ref="phoneInputEl"
              :model-value="flow.phoneDisplay.value"
              name="phone"
              type="tel"
              inputmode="tel"
              autocomplete="tel-national"
              dir="ltr"
              :placeholder="t('auth.signIn.phone.placeholder')"
              :readonly="flow.busy.value"
              :aria-invalid="phoneError ? 'true' : undefined"
              :aria-describedby="phoneError ? 'phone-change-phone-error' : undefined"
              class="text-start"
              @update:model-value="flow.setPhoneInput(String($event))"
              @blur="flow.phoneTouched.value = true"
            />
            <p v-if="phoneError" id="phone-change-phone-error" data-slot="field-error" class="text-destructive text-sm">{{ phoneError }}</p>
          </div>
          <p v-if="transportError" class="text-destructive text-sm" role="alert">{{ transportError }}</p>
          <Button v-if="flow.error.value === 'generic'" type="button" variant="link" class="self-start px-0" @click="reload()">{{ t("auth.signIn.errors.reload") }}</Button>
        </template>

        <!-- Step two: the code -->
        <template v-else-if="flow.step.value === 'code'">
          <OtpField ref="otpField" v-model="flow.code.value" :label="t('auth.signIn.code.label')" :invalid="flow.error.value === 'incorrect'" :readonly="flow.busy.value" :locale="digits" />
          <p v-if="flow.resentSameCode.value" class="text-muted-foreground text-center text-xs" role="status" data-slot="resent-notice">{{ t("auth.signIn.code.resentSame") }}</p>
          <p v-if="flow.testCodeFilled.value" class="text-muted-foreground text-center text-xs" data-slot="test-mode-notice">{{ t("auth.signIn.code.testMode") }}</p>
          <p v-if="flow.error.value === 'incorrect'" class="text-destructive text-center text-sm" role="alert" data-slot="wrong-code">{{ t("auth.signIn.code.wrong") }}</p>
          <p v-if="transportError" class="text-destructive text-center text-sm" role="alert">{{ transportError }}</p>
          <p class="text-muted-foreground text-center text-xs" data-slot="other-devices-note">{{ t("admin.account.phoneChange.otherDevices") }}</p>
          <div class="flex flex-col items-center gap-1">
            <Button type="button" variant="ghost" size="sm" data-slot="phone-change-resend" :disabled="flow.resendSeconds.value > 0 || flow.busy.value" @click="flow.resend()">
              {{ flow.resendSeconds.value > 0 ? t("auth.signIn.code.resendIn", { seconds: toLocaleDigits(String(flow.resendSeconds.value), digits) }) : t("auth.signIn.code.resend") }}
            </Button>
            <Button type="button" variant="ghost" size="sm" data-slot="phone-change-different" @click="flow.changeNumber()">{{ t("auth.signIn.code.useDifferent") }}</Button>
          </div>
        </template>

        <!-- Expired, too many attempts, and the number belongs to another account -->
        <template v-else>
          <p data-slot="phone-change-state" :data-state="flow.step.value" class="text-muted-foreground text-sm" role="status">{{ heading.description }}</p>
          <p v-if="transportError" class="text-destructive text-sm" role="alert">{{ transportError }}</p>
          <Button v-if="flow.step.value !== 'in_use'" type="button" data-slot="phone-change-new-code" :disabled="flow.busy.value" @click="flow.sendNewCode()">
            {{ t(`auth.signIn.${flow.step.value}.cta`) }}
          </Button>
          <Button type="button" :variant="flow.step.value === 'in_use' ? 'default' : 'ghost'" data-slot="phone-change-different" @click="flow.changeNumber()">
            {{ t("auth.signIn.code.useDifferent") }}
          </Button>
        </template>

        <DialogFooter v-if="flow.step.value === 'phone' || flow.step.value === 'code'">
          <Button v-if="flow.step.value === 'phone'" type="submit" data-slot="phone-change-send" :disabled="!flow.canSend.value">{{ t("admin.account.phoneChange.send") }}</Button>
          <Button v-else type="submit" data-slot="phone-change-verify" :disabled="flow.busy.value || flow.code.value.length !== 5">{{ t("admin.account.phoneChange.verify") }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
