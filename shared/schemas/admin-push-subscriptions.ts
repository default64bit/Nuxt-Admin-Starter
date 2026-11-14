import { z } from "zod";
import { LOCALES, type Locale } from "../constants/database-enums";

// An admin's own browser push devices (admin-notifications spec "API contract"; notifications spec "Browser push
// channel for admins"). The endpoint and the keys are capability material: they are accepted here and never returned.

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** A push service endpoint is an HTTPS URL (browsers refuse anything else). */
const endpointSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "invalid_endpoint");

/** `PushSubscription.toJSON()`: `p256dh` is a 65-byte P-256 point and `auth` a 16-byte secret, both URL-safe base64. */
const p256dhSchema = z.string().min(80).max(100).regex(BASE64URL);
const authSchema = z.string().min(16).max(32).regex(BASE64URL);

export const pushSubscribeSchema = z
  .object({
    endpoint: endpointSchema,
    keys: z.object({ p256dh: p256dhSchema, auth: authSchema }).strict(),
    localeScope: z.enum(LOCALES),
  })
  .strict();
export type PushSubscribeBody = z.output<typeof pushSubscribeSchema>;

/** Removing "this browser's" subscription names it by endpoint, in the body so the capability URL never lands in a URL log. */
export const pushUnsubscribeSchema = z.object({ endpoint: endpointSchema }).strict();
export type PushUnsubscribeBody = z.output<typeof pushUnsubscribeSchema>;

export interface PushDeviceView {
  id: string;
  deviceLabel: string;
  localeScope: Locale;
  createdAt: string;
  lastSuccessAt: string | null;
}

/** `sent` = the push service took it; `rejected` = it no longer knows the device; `unavailable` = anything else (not configured, down, throttled). */
export const PUSH_TEST_RESULTS = ["sent", "rejected", "unavailable"] as const;
export type PushTestResult = (typeof PUSH_TEST_RESULTS)[number];

/** At most one test push per admin in this many seconds. */
export const PUSH_TEST_INTERVAL_SECONDS = 30;
