import { otpRequestSchema, otpVerifySchema } from "./auth";

/** `{ phone, locale }`: the new sign-in number (any supported format, normalized) and the SMS language. */
export const phoneChangeRequestSchema = otpRequestSchema;

/** `{ phone, code }`: the new number and the five-digit code sent to it. */
export const phoneChangeVerifySchema = otpVerifySchema;

/** The verify answer: the account's new canonical sign-in phone. */
export interface PhoneChangeVerifyResponse {
  phone: string;
}
