import { z } from "zod";
import { LOCALES, type Locale } from "../constants/database-enums";
import type { AdminChannelKey, ChannelAvailability } from "../constants/admin-channels";

// A User's own notification settings: one choice per registered Channel and one Message language. Own state only; the
// Inbox itself cannot be turned off.

/** Strict: an unknown or reserved Channel key (`sms`, `email`) is a validation error, not silently ignored. */
export const notificationSettingsSaveSchema = z
  .object({
    channels: z.object({ telegram: z.boolean().optional(), push: z.boolean().optional() }).strict().default({}),
    locale: z.enum(LOCALES),
  })
  .strict();
export type NotificationSettingsSaveBody = z.output<typeof notificationSettingsSaveSchema>;

export interface ChannelSettings {
  key: AdminChannelKey;
  availability: ChannelAvailability;
  /** The User can be reached on it (for Telegram, an active binding). */
  connected: boolean;
  /** The User's own choice; on unless they turned it off. */
  enabled: boolean;
  /** When a degraded Channel went down. */
  since: string | null;
  /** Where to connect, when the Channel has such a place and the User is not connected. */
  connectUrl: string | null;
}

export interface NotificationSettings {
  /** One entry per registered Channel; empty while no Channel adapter is installed. */
  channels: ChannelSettings[];
  locale: Locale;
  /** The VAPID public key a browser subscribes with; present only while Web Push is operational by configuration. */
  vapidPublicKey?: string;
}
