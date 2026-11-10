import { z } from "zod";
import { requiredOrInvalid } from "./issue-messages";
import { normalizeDigits, normalizeIranianMobile } from "../utils/phone";

/** A phone typed in any supported format, normalized to `+989XXXXXXXXX` (client and server alike). */
export const phoneSchema = z
  .string(requiredOrInvalid)
  .transform((value, ctx) => {
    const normalized = normalizeIranianMobile(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "invalid_phone" });
      return z.NEVER;
    }
    return normalized;
  });

/** Five digits in any script, spaces and dashes allowed; yields ASCII digits. */
export const otpCodeSchema = z
  .string(requiredOrInvalid)
  .transform((value, ctx) => {
    const digits = normalizeDigits(value).replace(/[\s-]/g, "");
    if (!/^\d{5}$/.test(digits)) {
      ctx.addIssue({ code: "custom", message: "invalid_code" });
      return z.NEVER;
    }
    return digits;
  });

export const otpVerifySchema = z.object({ phone: phoneSchema, code: otpCodeSchema });
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const otpRequestSchema = z.object({
  phone: phoneSchema,
  locale: z.enum(["fa", "en"]),
});

export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export interface OtpRequestResponse {
  phone: string;
  /** Seconds until the active code expires (relative; a resend does not extend it). */
  expiresIn: number;
  /** Seconds until another SMS may be requested. */
  resendIn: number;
  /** Present only for the mock SMS adapter in `local`/`test`. */
  testCode?: string;
}
