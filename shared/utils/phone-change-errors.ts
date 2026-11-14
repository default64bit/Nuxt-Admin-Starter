import { parseApiError, parseFieldErrors } from "./api-error-client";

/**
 * How each documented phone-change failure is presented (users-and-roles spec, "My account"): exactly one state
 * per code. `in_use` exists only at verification, after a correct code, so the request step can never be used to
 * probe which numbers are registered. Unknown codes and `csrf_rejected` share the generic state.
 */
export type PhoneChangeRequestFailure = "current" | "invalid" | "resend_sync" | "rate_limited" | "sms_unavailable" | "unauthenticated" | "network" | "generic";
export type PhoneChangeVerifyFailure = "incorrect" | "expired" | "attempts" | "in_use" | "current" | "unauthenticated" | "network" | "generic";

const isCurrentPhone = (error: unknown) => parseFieldErrors(error).phone?.includes("current_phone") === true;

export function classifyPhoneChangeRequestError(error: unknown): PhoneChangeRequestFailure {
  const parsed = parseApiError(error);
  switch (parsed.code) {
    case "validation_failed":
      return isCurrentPhone(error) ? "current" : "invalid";
    case "otp_resend_too_soon":
      return "resend_sync";
    case "otp_rate_limited":
      return "rate_limited";
    case "sms_unavailable":
      return "sms_unavailable";
    case "unauthenticated":
      return "unauthenticated";
    default:
      return parsed.network ? "network" : "generic";
  }
}

export function classifyPhoneChangeVerifyError(error: unknown): PhoneChangeVerifyFailure {
  const parsed = parseApiError(error);
  switch (parsed.code) {
    case "otp_incorrect":
      return "incorrect";
    case "otp_expired":
      return "expired";
    case "otp_attempts_exceeded":
      return "attempts";
    case "phone_in_use":
      return "in_use";
    case "validation_failed":
      return isCurrentPhone(error) ? "current" : "generic";
    case "unauthenticated":
      return "unauthenticated";
    default:
      return parsed.network ? "network" : "generic";
  }
}
