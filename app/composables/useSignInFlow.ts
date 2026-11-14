import { useMutation } from "@tanstack/vue-query";
import { useIntervalFn } from "@vueuse/core";
import { parseApiError } from "~~/shared/utils/api-error-client";
import { formatPhoneForDisplay, toLocaleDigits } from "~~/shared/utils/locale-digits";
import { localizedPath } from "~~/shared/utils/locale-path";
import { normalizeDigits, normalizeIranianMobile } from "~~/shared/utils/phone";
import { SIGNED_IN_HOME, sanitizeReturnPath } from "~~/shared/utils/return-path";
import type { SessionPayload } from "~~/shared/utils/session-state";
import { classifyRequestError, classifyVerifyError } from "~~/shared/utils/sign-in-errors";
import { parseSavedStep, type SavedStep as SavedStepState } from "~~/shared/utils/sign-in-step";

export type SignInStep = "phone" | "code" | "expired" | "attempts";
export type SignInError = "invalid_phone" | "rate_limited" | "sms_unavailable" | "network" | "incorrect" | "generic";

interface OtpRequestResponse {
  phone: string;
  expiresIn: number;
  resendIn: number;
  testCode?: string;
}

const STORAGE_KEY = "sign-in-step";

interface SavedStep {
  phone: string;
  expiresAt: number;
  resendAt: number;
}

function readSaved(now: number): SavedStepState | null {
  try {
    return parseSavedStep(sessionStorage.getItem(STORAGE_KEY), now);
  } catch {
    return null;
  }
}

const writeSaved = (saved: SavedStep) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage may be unavailable; the flow still works in memory.
  }
};
const clearSaved = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

/**
 * The sign-in page's state machine: phone, code, expired and too-many-attempts steps, every error inline. Only
 * `{ phone, expiresAt, resendAt }` is saved per tab; the code itself never is. A successful verify seeds the
 * session cache and goes to the `redirect` query (validated) or the admin home.
 */
export function useSignInFlow() {
  const { locale } = useI18n();
  const route = useRoute();
  const sessionCache = useSessionCache();
  // One-second tick driving the resend countdown and the rate-limit lock.
  const tick = ref(Date.now());
  if (import.meta.client) useIntervalFn(() => (tick.value = Date.now()), 1000);

  const digitLocale = computed(() => (locale.value === "en" ? "en" : "fa"));
  const step = ref<SignInStep>("phone");
  /** ASCII digits as typed (any script is normalized on input). */
  const phoneInput = ref("");
  const phoneTouched = ref(false);
  const phone = ref<string | null>(null);
  const code = ref("");
  const error = ref<SignInError | null>(null);
  const retryAfter = ref<number | null>(null);
  const rateLimitedUntil = ref<number | null>(null);
  const testCodeFilled = ref(false);
  const resentSameCode = ref(false);
  const resendAt = ref(0);

  const phoneDisplay = computed(() => toLocaleDigits(phoneInput.value, digitLocale.value));
  const phoneInvalid = computed(() => phoneTouched.value && phoneInput.value.trim() !== "" && normalizeIranianMobile(phoneInput.value) === null);
  const phoneEmptyAfterTouch = computed(() => phoneTouched.value && phoneInput.value.trim() === "");
  const resendSeconds = computed(() => Math.max(0, Math.ceil((resendAt.value - tick.value) / 1000)));
  const rateLimitedNow = computed(() => rateLimitedUntil.value !== null && tick.value < rateLimitedUntil.value);
  const rateLimitedMinutes = computed(() => Math.max(1, Math.ceil((retryAfter.value ?? 60) / 60)));
  const phoneForDisplay = computed(() => (phone.value ? formatPhoneForDisplay(phone.value, digitLocale.value) : ""));

  const requestMutation = useMutation({
    mutationFn: (payload: { phone: string; locale: string }) => postJson<OtpRequestResponse>("/api/v1/auth/otp/request", payload),
    retry: false,
  });
  const verifyMutation = useMutation({
    mutationFn: (payload: { phone: string; code: string }) => postJson<SessionPayload>("/api/v1/auth/otp/verify", payload),
    retry: false,
  });
  const busy = computed(() => requestMutation.isPending.value || verifyMutation.isPending.value);

  function setPhoneInput(raw: string) {
    phoneInput.value = normalizeDigits(raw);
    if (error.value === "invalid_phone") error.value = null;
  }

  function applyCountdown(response: OtpRequestResponse) {
    const at = Date.now();
    tick.value = at;
    resendAt.value = at + response.resendIn * 1000;
    writeSaved({ phone: response.phone, expiresAt: at + response.expiresIn * 1000, resendAt: resendAt.value });
  }

  /** Resend from the code step: inside the two-minute window the server re-sends the same code. */
  async function resend(): Promise<void> {
    const inWindow = readSaved(Date.now())?.kind === "code";
    await sendCode();
    resentSameCode.value = inWindow && step.value === "code" && error.value === null;
  }

  async function sendCode(): Promise<void> {
    error.value = null;
    resentSameCode.value = false;
    phoneTouched.value = true;
    const normalized = normalizeIranianMobile(phoneInput.value);
    if (!normalized) return;
    try {
      const response = await requestMutation.mutateAsync({ phone: normalized, locale: digitLocale.value });
      phone.value = response.phone;
      applyCountdown(response);
      code.value = response.testCode ?? "";
      testCodeFilled.value = Boolean(response.testCode);
      step.value = "code";
    } catch (cause) {
      const parsed = parseApiError(cause);
      const failure = classifyRequestError(parsed);
      if (failure === "resend_sync") {
        // Not an error: stay on the code step and re-sync the countdown from the server.
        phone.value = normalized;
        tick.value = Date.now();
        resendAt.value = tick.value + (parsed.retryAfter ?? 30) * 1000;
        step.value = "code";
      } else if (failure === "rate_limited") {
        retryAfter.value = parsed.retryAfter;
        rateLimitedUntil.value = Date.now() + (parsed.retryAfter ?? 60) * 1000;
        error.value = "rate_limited";
        step.value = "phone";
      } else error.value = failure;
    }
  }

  /** Where a successful sign-in goes: the validated `redirect` query, else the admin home. */
  function destination(): string {
    const home = localizedPath(SIGNED_IN_HOME, digitLocale.value);
    const redirect = route.query.redirect;
    return sanitizeReturnPath(Array.isArray(redirect) ? redirect[0] : redirect, home);
  }

  async function verifyCode(): Promise<void> {
    if (!phone.value || code.value.length !== 5) return;
    error.value = null;
    try {
      const session = await verifyMutation.mutateAsync({ phone: phone.value, code: code.value });
      clearSaved();
      sessionCache.setSession(session);
      await navigateTo(destination());
    } catch (cause) {
      const failure = classifyVerifyError(parseApiError(cause));
      if (failure === "incorrect") {
        code.value = "";
        error.value = "incorrect";
      } else if (failure === "expired" || failure === "attempts") {
        clearSaved();
        step.value = failure === "expired" ? "expired" : "attempts";
      } else error.value = failure; // network keeps the typed code
    }
  }

  /** "Send a new code" from the expired and too-many-attempts states. */
  async function sendNewCode() {
    code.value = "";
    await sendCode();
  }

  function changeNumber() {
    clearSaved();
    resentSameCode.value = false;
    code.value = "";
    error.value = null;
    testCodeFilled.value = false;
    step.value = "phone";
  }

  /** Resume the code step (remaining time kept), or show the expired state, from this tab's saved step. */
  function restore() {
    const saved = readSaved(Date.now());
    if (!saved) return;
    phone.value = saved.phone;
    phoneInput.value = saved.phone.replace(/^\+98/, "0");
    if (saved.kind === "code") {
      resendAt.value = saved.resendAt;
      step.value = "code";
    } else {
      clearSaved();
      step.value = "expired";
    }
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
    phoneEmptyAfterTouch,
    phoneForDisplay,
    code,
    error,
    busy,
    testCodeFilled,
    resendSeconds,
    rateLimitedNow,
    rateLimitedMinutes,
    setPhoneInput,
    sendCode,
    resend,
    resentSameCode,
    verifyCode,
    sendNewCode,
    changeNumber,
    restore,
  };
}
