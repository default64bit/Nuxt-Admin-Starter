import type { Tx } from "../database/types";
import { ADMIN_CHANNEL_KEYS } from "../../shared/constants/admin-channels";
import type { AttentionType } from "../../shared/constants/notification-catalog";
import { getAdminChannels } from "../notifications/admin-channels";
import { channelAvailability } from "../notifications/channel-health";
import { findRecipients, insertOutbox } from "../repositories/admin-channels.repository";

export interface FanOutNotification {
  id: string;
  type: AttentionType;
  requiredPermission: string;
  recipientUserId: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  tokens: string[];
}

/**
 * At event commit, queues one outside message per User, Channel and address, in the event's own transaction: only when
 * the Channel is operational, the User holds the item's Permission (and is its recipient when it names one), their
 * choice is on (a missing row is on) and they are reachable. A Channel that is not configured, switched off or degraded
 * creates no rows. The row keeps the address snapshot and the User's Message language; the worker re-checks it all at send time.
 */
export async function fanOutChannels(tx: Tx, notification: FanOutNotification): Promise<number> {
  let queued = 0;
  for (const channel of getAdminChannels()) {
    if (!(ADMIN_CHANNEL_KEYS as readonly string[]).includes(channel.key)) continue;
    if ((await channelAvailability(tx, channel)) !== "operational") continue;
    const recipients = await findRecipients(tx, { permission: notification.requiredPermission, channel: channel.key, ...(notification.recipientUserId ? { userId: notification.recipientUserId } : {}) });
    for (const recipient of recipients) {
      if (!recipient.enabled) continue;
      for (const address of await channel.addressesFor(tx, recipient.userId)) {
        const id = await insertOutbox(tx, {
          dedupeKey: `${channel.key}:${notification.id}:${address}`,
          channel: channel.key,
          eventKey: notification.type,
          locale: recipient.locale,
          recipient: address,
          tokens: notification.tokens,
          sourceEntityType: notification.sourceEntityType,
          sourceEntityId: notification.sourceEntityId,
          notificationId: notification.id,
          recipientUserId: recipient.userId,
        });
        if (id) queued += 1;
      }
    }
  }
  return queued;
}
