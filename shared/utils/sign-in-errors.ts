import type { ParsedApiError } from "./api-error-client";

/**
 * How each documented auth error code is presented in the sign-in dialog (authentication spec,
 * "Sign-in dialog states"). Exactly one state per code; unknown codes and `csrf_rejected` share the
 * generic state, which offers a page reload. No copy here ever reveals whether a phone has an account.
 */
export type RequestFailure = "resend_sync" | "rate_limited" | "sms_unavailable" | "network" | "generic";
export type VerifyFailure = "incorrect" | "expired" | "attempts" | "network" | "generic";

export function classifyRequestError(error: ParsedApiError): RequestFailure {
  switch (error.code) {
    case "otp_resend_too_soon":
      return "resend_sync";
    case "otp_rate_limited":
      return "rate_limited";
    case "sms_unavailable":
      return "sms_unavailable";
    default:
      return error.network ? "network" : "generic";
  }
}

export function classifyVerifyError(error: ParsedApiError): VerifyFailure {
  switch (error.code) {
    case "otp_incorrect":
      return "incorrect";
    case "otp_expired":
      return "expired";
    case "otp_attempts_exceeded":
      return "attempts";
    default:
      return error.network ? "network" : "generic";
  }
}
