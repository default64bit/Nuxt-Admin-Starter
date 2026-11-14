import type { Db } from "../database/types";
import type { NotificationSettings, NotificationSettingsSaveBody } from "../../shared/schemas/admin-notification-settings";
import { getAdminChannels, type AdminChannelRegistry } from "../notifications/admin-channels";
import { channelAvailability } from "../notifications/channel-health";
import { pushPublicKeyOf } from "../notifications/push/config";
import { healthOf, messageLocaleOf, preferencesOf, saveMessageLocale, savePreference } from "../repositories/admin-channels.repository";

// A User's own notification settings: reads and writes touch only the actor's rows. They are a personal preference, so
// a save is not audited.

export interface NotificationSettingsDeps {
  db: Db;
  channels?: AdminChannelRegistry;
}

export async function getNotificationSettings({ db, channels = getAdminChannels() }: NotificationSettingsDeps, userId: string): Promise<NotificationSettings> {
  const preferences = await preferencesOf(db, userId);
  const result: NotificationSettings = { channels: [], locale: await messageLocaleOf(db, userId) };
  for (const channel of channels) {
    const availability = await channelAvailability(db, channel);
    const connected = (await channel.addressesFor(db, userId)).length > 0;
    result.channels.push({
      key: channel.key,
      availability,
      connected,
      enabled: preferences[channel.key] ?? true,
      since: availability === "degraded" ? ((await healthOf(db, channel.key))?.since.toISOString() ?? null) : null,
      connectUrl: connected ? null : (channel.connectUrl?.() ?? null),
    });
  }
  const vapidPublicKey = channels.some((channel) => channel.key === "push") ? pushPublicKeyOf() : null;
  if (vapidPublicKey) result.vapidPublicKey = vapidPublicKey;
  return result;
}

/** Saves the choices; a save that changes nothing writes nothing. Returns the settings as they are now. */
export async function saveNotificationSettings(deps: NotificationSettingsDeps, userId: string, body: NotificationSettingsSaveBody): Promise<NotificationSettings> {
  const before = await getNotificationSettings(deps, userId);
  await deps.db.transaction(async (tx) => {
    for (const channel of before.channels) {
      const next = (body.channels as Record<string, boolean | undefined>)[channel.key];
      if (next !== undefined && next !== channel.enabled) await savePreference(tx, userId, channel.key, next);
    }
    if (body.locale !== before.locale) await saveMessageLocale(tx, userId, body.locale);
  });
  return getNotificationSettings(deps, userId);
}
