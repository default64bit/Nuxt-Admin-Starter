import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { useIntervalFn } from "@vueuse/core";
import { toast } from "vue-sonner";
import { ACCOUNT_KEY } from "~/composables/admin/useAdminAccount";
import type { AccountResponse } from "~~/shared/schemas/account";
import type { PhoneChangeVerifyResponse } from "~~/shared/schemas/phone-change";
import { parseApiError } from "~~/shared/utils/api-error-client";
import { formatPhoneForDisplay, toLocaleDigits } from "~~/shared/utils/locale-digits";
import { normalizeDigits, normalizeIranianMobile } from "~~/shared/utils/phone";
import { classifyPhoneChangeRequestError, classifyPhoneChangeVerifyError } from "~~/shared/utils/phone-change-errors";

export type PhoneChangeStep = "phone" | "code" | "expired" | "attempts" | "in_use";
export type PhoneChangeError = "invalid" | "rate_limited" | "sms_unavailable" | "network" | "incorrect" | "generic";
export type PhoneChangeOutcome = "changed" | "failed";

interface OtpRequestResponse {
  phone: string;
  expiresIn: number;
  resendIn: number;
  testCode?: string;
}

/**
 * The phone-change dialog's state machine (users-and-roles spec, "My account"): the new number, the code, and the
 * expired, too-many-attempts and number-in-use states, every failure inline. The number changes only on the
 * server, after a correct code; closing the dialog discards the local state and nothing else. The current number is
 * refused as soon as it is typed. A `401` is handled once for the whole app (the Vue Query plugin).
 */
export function usePhoneChange(open: Ref<boolean>, currentPhone: Ref<string>) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();

  const digits = computed(() => (locale.value === "en" ? "en" : "fa"));
  const tick = ref(Date.now());
  const step = ref<PhoneChangeStep>("phone");
  /** ASCII digits as typed (any script is normalized on input). */
  const phoneInput = ref("");
  const phoneTouched = ref(false);
  const phone = ref<string | null>(null);
  const code = ref("");
  const error = ref<PhoneChangeError | null>(null);
  const retryAfter = ref<number | null>(null);
  const rateLimitedUntil = ref<number | null>(null);
  const resendAt = ref(0);
  const expiresAt = ref(0);
  const testCodeFilled = ref(false);
  const resentSameCode = ref(false);

  const normalized = computed(() => normalizeIranianMobile(phoneInput.value));
  const phoneDisplay = computed(() => toLocaleDigits(phoneInput.value, digits.value));
  const phoneForDisplay = computed(() => (phone.value ? formatPhoneForDisplay(phone.value, digits.value) : ""));
  /** Shown at once, while typing: the account already has this number. */
  const isCurrent = computed(() => normalized.value !== null && normalized.value === currentPhone.value);
  const phoneInvalid = computed(() => phoneTouched.value && (phoneInput.value.trim() === "" || normalized.value === null));
  const resendSeconds = computed(() => Math.max(0, Math.ceil((resendAt.value - tick.value) / 1000)));
  const rateLimitedNow = computed(() => rateLimitedUntil.value !== null && tick.value < rateLimitedUntil.value);
  const rateLimitedMinutes = computed(() => Math.max(1, Math.ceil((retryAfter.value ?? 60) / 60)));

  const requestMutation = useMutation({
    mutationFn: (body: { phone: string; locale: string }) => postJson<OtpRequestResponse>("/api/v1/admin/account/phone-change/request", body),
    retry: false,
  });
  const verifyMutation = useMutation({
    mutationFn: (body: { phone: string; code: string }) => postJson<PhoneChangeVerifyResponse>("/api/v1/admin/account/phone-change/verify", body),
    retry: false,
  });
  const busy = computed(() => requestMutation.isPending.value || verifyMutation.isPending.value);
  const canSend = computed(() => normalized.value !== null && !isCurrent.value && !rateLimitedNow.value && !busy.value);

  // One tick a second drives the countdown, the lock and the expiry, and only while a code is live.
  const timer = useIntervalFn(
    () => {
      tick.value = Date.now();
      if (step.value === "code" && tick.value >= expiresAt.value) {
        code.value = "";
        error.value = null;
        step.value = "expired";
      }
    },
    1000,
    { immediate: false },
  );
  watch([open, step], ([isOpen, current]) => (isOpen && current === "code" ? timer.resume() : timer.pause()));

  function setPhoneInput(raw: string) {
    phoneInput.value = normalizeDigits(raw);
    phone.value = null;
    if (error.value === "invalid") error.value = null;
  }

  function reset() {
    step.value = "phone";
    phoneInput.value = "";
    phoneTouched.value = false;
    phone.value = null;
    code.value = "";
    error.value = null;
    retryAfter.value = null;
    rateLimitedUntil.value = null;
    testCodeFilled.value = false;
    resentSameCode.value = false;
  }
  // Closing discards what was typed; nothing server-side changes until a correct code is verified.
  watch(open, (isOpen) => {
    if (!isOpen) reset();
  });

  async function sendCode(): Promise<"sent" | "failed"> {
    error.value = null;
    resentSameCode.value = false;
    phoneTouched.value = true;
    // On the phone step the number is what is typed; from the code and the expired states it is the one a code went to.
    const target = step.value === "phone" ? normalized.value : phone.value;
    if (!target || target === currentPhone.value) return "failed";
    try {
      const response = await requestMutation.mutateAsync({ phone: target, locale: digits.value });
      const at = Date.now();
      tick.value = at;
      phone.value = response.phone;
      resendAt.value = at + response.resendIn * 1000;
      expiresAt.value = at + response.expiresIn * 1000;
      code.value = response.testCode ?? "";
      testCodeFilled.value = Boolean(response.testCode);
      step.value = "code";
      return "sent";
    } catch (cause) {
      const failure = classifyPhoneChangeRequestError(cause);
      if (failure === "resend_sync") {
        // Not an error: the earlier code is still valid; stay on (or move to) the code step and re-sync the countdown.
        const wait = parseApiError(cause).retryAfter ?? 30;
        phone.value = target;
        tick.value = Date.now();
        resendAt.value = tick.value + wait * 1000;
        if (step.value !== "code") expiresAt.value = tick.value + 120_000;
        step.value = "code";
        return "sent";
      }
      if (failure === "rate_limited") {
        retryAfter.value = parseApiError(cause).retryAfter;
        rateLimitedUntil.value = Date.now() + (retryAfter.value ?? 60) * 1000;
        error.value = "rate_limited";
        step.value = "phone";
      } else if (failure === "current" || failure === "invalid") {
        phoneTouched.value = true;
        error.value = "invalid";
      } else if (failure === "unauthenticated") {
        error.value = "generic"; // the app-wide handler is already leaving the page
      } else error.value = failure;
      return "failed";
    }
  }

  /** Resend from the code step: inside the two-minute window the server sends the same code again. */
  async function resend() {
    const inWindow = tick.value < expiresAt.value;
    const outcome = await sendCode();
    resentSameCode.value = outcome === "sent" && inWindow && error.value === null;
    return outcome;
  }

  async function verifyCode(): Promise<PhoneChangeOutcome> {
    if (!phone.value || code.value.length !== 5) return "failed";
    error.value = null;
    try {
      const result = await verifyMutation.mutateAsync({ phone: phone.value, code: code.value });
      queryClient.setQueryData<AccountResponse>(ACCOUNT_KEY, (previous) => (previous ? { ...previous, phone: result.phone } : previous));
      toast.success(t("admin.account.phoneChange.success"));
      return "changed";
    } catch (cause) {
      const failure = classifyPhoneChangeVerifyError(cause);
      if (failure === "incorrect") {
        code.value = "";
        error.value = "incorrect";
      } else if (failure === "expired" || failure === "attempts" || failure === "in_use") {
        code.value = "";
        step.value = failure;
      } else if (failure === "current") {
        step.value = "phone";
        phoneTouched.value = true;
      } else if (failure === "unauthenticated") {
        error.value = "generic";
      } else error.value = failure; // network and generic keep the typed code
      return "failed";
    }
  }

  /** "Send a new code" from the expired and too-many-attempts states. */
  async function sendNewCode() {
    code.value = "";
    return sendCode();
  }

  /** Back to the phone step with the field emptied (also the way out of the number-in-use state). */
  function changeNumber() {
    reset();
  }

  // The wrong-code message clears on the next keystroke (the boxes were just emptied, so only a non-empty value counts).
  watch(code, (value) => {
    if (value !== "" && error.value === "incorrect") error.value = null;
  });

  return {
    step,
    phoneInput,
    phoneDisplay,
    phoneTouched,
    phoneInvalid,
    phoneForDisplay,
    isCurrent,
    canSend,
    code,
    error,
    busy,
    testCodeFilled,
    resentSameCode,
    resendSeconds,
    rateLimitedNow,
    rateLimitedMinutes,
    setPhoneInput,
    sendCode,
    resend,
    verifyCode,
    sendNewCode,
    changeNumber,
  };
}
