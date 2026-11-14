import { PUSH_TEST_COPY, PUSH_TEST_EVENT_KEY } from "../../shared/constants/admin-push";
import { PUSH_TEST_INTERVAL_SECONDS, type PushDeviceView, type PushSubscribeBody, type PushTestResult } from "../../shared/schemas/admin-push-subscriptions";
import type { Db } from "../database/types";
import { channelAvailability } from "../notifications/channel-health";
import { findChannel, type AdminChannelRegistry } from "../notifications/admin-channels";
import { messageLocaleOf } from "../repositories/admin-channels.repository";
import { deleteOwnedByEndpoint, deleteOwnedById, findSendTarget, listDevices, upsertSubscription, type PushDevice } from "../repositories/push-subscriptions.repository";
import { deviceLabelFromUserAgent } from "../utils/device-label";
import { DomainError, tooManyRequests } from "../utils/domain-errors";

// A User's own browser push devices. Own devices only: another User's id is a 404. The endpoint and the keys go in and
// are never returned, logged or stored anywhere else. Devices are personal preferences, so they are not audited.

export interface PushSubscriptionsDeps {
  db: Db;
  channels: AdminChannelRegistry;
  now?: () => Date;
}

const toView = (device: PushDevice): PushDeviceView => ({
  id: device.id,
  deviceLabel: device.deviceLabel,
  localeScope: device.localeScope,
  createdAt: device.createdAt.toISOString(),
  lastSuccessAt: device.lastSuccessAt?.toISOString() ?? null,
});

const notFound = () => new DomainError(404, "Not Found", "not_found");

export async function listPushDevices({ db }: PushSubscriptionsDeps, userId: string): Promise<PushDeviceView[]> {
  return (await listDevices(db, userId)).map(toView);
}

/** Subscribes this browser; an endpoint that belongs to another User moves to the caller. The label comes from the user agent, which is not stored. */
export async function subscribePush({ db }: PushSubscriptionsDeps, userId: string, input: PushSubscribeBody & { userAgent?: string | null }): Promise<PushDeviceView> {
  const device = await upsertSubscription(db, {
    userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    localeScope: input.localeScope,
    deviceLabel: deviceLabelFromUserAgent(input.userAgent),
  });
  return toView(device);
}

/** Removes one of the caller's own devices, by id or by endpoint ("this browser"). */
export async function removePushDevice({ db }: PushSubscriptionsDeps, userId: string, target: { id: string } | { endpoint: string }): Promise<void> {
  const device = "id" in target ? await deleteOwnedById(db, userId, target.id) : await deleteOwnedByEndpoint(db, userId, target.endpoint);
  if (!device) throw notFound();
}

// The last test push per User. A test push is a convenience with no stored state (no audit, no outbox, no Inbox item),
// so the 30 second pace lives in memory; the app runs as one process.
const lastTest = new Map<string, number>();

/** For tests: forget every pace. */
export const resetPushTestPace = () => lastTest.clear();

/**
 * Pushes the fixed test text to one of the caller's devices, in their Message language. No Inbox item, outbox row or
 * audit. At most one per User per 30 seconds (`429`). Reports `sent`, `rejected` (the push service no longer knows the
 * device) or `unavailable` (Channel off, down, throttled or unreachable).
 */
export async function sendPushTest(deps: PushSubscriptionsDeps, userId: string, id: string): Promise<{ result: PushTestResult }> {
  const target = await findSendTarget(deps.db, id);
  if (!target || target.userId !== userId) throw notFound();

  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const last = lastTest.get(userId);
  const windowMs = PUSH_TEST_INTERVAL_SECONDS * 1000;
  if (last !== undefined && nowMs - last < windowMs) throw tooManyRequests("push_test_rate_limited", Math.ceil((windowMs - (nowMs - last)) / 1000));

  const channel = findChannel(deps.channels, "push");
  if (!channel || (await channelAvailability(deps.db, channel)) !== "operational") return { result: "unavailable" };

  lastTest.set(userId, nowMs);
  const locale = await messageLocaleOf(deps.db, userId);
  const copy = PUSH_TEST_COPY[locale];
  const text = JSON.stringify({ title: copy.title, body: copy.body, link: null, locale, dir: locale === "fa" ? "rtl" : "ltr" });
  const outcome = await channel.send({ address: id, text, eventKey: PUSH_TEST_EVENT_KEY, locale, link: null, notificationId: null }, { db: deps.db });
  if (outcome.ok) return { result: "sent" };
  return { result: outcome.permanent && (outcome.category === "recipient_rejected" || outcome.category === "subscription_missing") ? "rejected" : "unavailable" };
}
