import { randomBytes } from "node:crypto";
import * as webpush from "web-push";
import { CREDENTIAL_FAILURE } from "../../../shared/constants/admin-channels";
import type { Locale } from "../../../shared/constants/database-enums";
import { attentionTitle, renderAttentionText } from "../../../shared/utils/attention-message";
import type { Db, Executor } from "../../database/types";
import { countUnread } from "../../repositories/admin-notifications.repository";
import { permissionKeysForUser } from "../../repositories/access.repository";
import { deleteStale, deleteSubscription, findSendTarget, markFailure, markSuccess, subscriptionIdsFor } from "../../repositories/push-subscriptions.repository";
import type { AdminNotificationChannel, ChannelDeliveryResult } from "../admin-channels";
import type { PushConfig } from "./config";

// The `push` Channel: browser Web Push (RFC 8030/8291/8292, VAPID) to every push device of a User through the
// `web-push` library (ADR-0028). The outbox `recipient` is the subscription id; the endpoint and keys are read here at send time and never leave this module,
// so no log line, result, audit event or outbox row can carry them.

/** 12 hours: a push the browser could not take yet is dropped after this long. */
export const PUSH_TTL_SECONDS = 43_200;
export const PUSH_TIMEOUT_MS = 8_000;
/** Apple's push service may not show a notification when a focused window exists unless the payload says so. */
export const APPLE_PUSH_HOST = "web.push.apple.com";
/** The made-up subscription the health probe addresses; FCM answers it `404`/`410` when the VAPID signature is accepted. */
export const PROBE_ENDPOINT_BASE = "https://fcm.googleapis.com/fcm/send/";

export interface PushPayload {
  notificationId: string | null;
  title: string;
  body: string;
  link: string | null;
  locale: Locale;
  dir: "rtl" | "ltr";
  /** The admin's unread count at send time (drives the app badge). */
  unread: number;
  mustShow: boolean;
}

export interface PushRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: Buffer | null;
}

export type PushAnswer = { kind: "answer"; status: number; retryAfter: string | null } | { kind: "network_error" };
export type PushTransport = (request: PushRequest, timeoutMs: number) => Promise<PushAnswer>;

/** The default transport: a plain POST. A failure to connect, a timeout or a reset is `network_error`; its text is never kept. */
export const fetchTransport: PushTransport = async (request, timeoutMs) => {
  try {
    const response = await fetch(request.endpoint, { method: "POST", headers: request.headers, body: request.body ? new Uint8Array(request.body) : undefined, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    await response.body?.cancel();
    return { kind: "answer", status: response.status, retryAfter: response.headers.get("retry-after") };
  } catch {
    return { kind: "network_error" };
  }
};

export interface PushChannelDeps {
  transport?: PushTransport;
  timeoutMs?: number;
  /** Where the health probe points (tests aim it at the fake push service). Defaults to a made-up FCM subscription. */
  probeEndpoint?: string;
}

/** `Retry-After` is delta-seconds or an HTTP date (RFC 9110); anything else is ignored. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

/** Maps a push service's answer to a delivery result (spec "Answers"). Never keeps the service's body or headers. */
export function classifyPushAnswer(answer: PushAnswer): ChannelDeliveryResult {
  if (answer.kind === "network_error") return { ok: false, permanent: false, category: "network_error" };
  const { status } = answer;
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 404 || status === 410) return { ok: false, permanent: true, category: "recipient_rejected" };
  if (status === 429) {
    const retryAfterSeconds = parseRetryAfter(answer.retryAfter);
    return { ok: false, permanent: false, category: "rate_limited", ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
  }
  if (status === 401 || status === 403) return { ok: false, permanent: true, category: CREDENTIAL_FAILURE };
  if (status === 400 || status === 413) return { ok: false, permanent: true, category: "push_rejected" };
  if (status >= 500) return { ok: false, permanent: false, category: "provider_unavailable" };
  return { ok: false, permanent: true, category: "unexpected_response" };
}

/**
 * The `Topic` header value for an attention type: URL-safe base64 characters, at most 32, so an offline browser keeps
 * only the newest push per type. The type's dots become dashes.
 */
export const pushTopicFor = (eventKey: string): string => eventKey.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32);

export const isAppleEndpoint = (endpoint: string): boolean => {
  try {
    return new URL(endpoint).hostname === APPLE_PUSH_HOST;
  } catch {
    return false;
  }
};

/** The device is gone for good (`404`/`410`): delete that device only. Nothing is audited and the endpoint and keys go nowhere. */
export async function removeGoneSubscription(db: Db, subscriptionId: string): Promise<void> {
  await deleteSubscription(db, subscriptionId);
}

async function unreadCountOf(db: Executor, userId: string): Promise<number> {
  return countUnread(db, { userId, permissions: (await permissionKeysForUser(db, userId)).keys });
}

/** A push device with no successful delivery for this long (from creation when it never had one) is purged. */
export const PUSH_SUBSCRIPTION_RETENTION_DAYS = 90;

async function purgeStalePushSubscriptions(db: Db, now: Date = new Date()): Promise<number> {
  return deleteStale(db, new Date(now.getTime() - PUSH_SUBSCRIPTION_RETENTION_DAYS * 24 * 60 * 60 * 1000));
}

export function createPushChannel(config: PushConfig, deps: PushChannelDeps = {}): AdminNotificationChannel {
  const transport = deps.transport ?? fetchTransport;
  const timeoutMs = deps.timeoutMs ?? PUSH_TIMEOUT_MS;
  const vapidDetails = { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey };

  /** Builds the VAPID-signed (and, with a payload, `aes128gcm`-encrypted) request and sends it once. */
  async function post(subscription: webpush.PushSubscription, payload: string | null, topic: string | null): Promise<ChannelDeliveryResult> {
    let request: PushRequest;
    try {
      const options = { vapidDetails, TTL: PUSH_TTL_SECONDS, urgency: "high" as const, ...(topic ? { topic } : {}) };
      const details = payload === null ? webpush.generateRequestDetails(subscription, null, options) : webpush.generateRequestDetails(subscription, payload, options);
      const { "Content-Length": _length, ...headers } = details.headers as Record<string, string>;
      request = { endpoint: details.endpoint, headers, body: details.body as Buffer | null };
    } catch {
      // Malformed stored keys, or a key the library refuses: never the library's text, which can echo the key.
      return { ok: false, permanent: true, category: "invalid_subscription" };
    }
    return classifyPushAnswer(await transport(request, timeoutMs));
  }

  return {
    key: "push",
    availability: () => config.state,
    addressesFor: (db, userId) => subscriptionIdsFor(db, userId),
    // The static part of the payload from the shared per-type copy; `send` adds the per-device and per-moment fields.
    render: (eventKey, tokens, locale, link) =>
      JSON.stringify({ title: attentionTitle(eventKey, locale), body: renderAttentionText(eventKey, tokens, locale), link, locale, dir: locale === "fa" ? "rtl" : "ltr" }),
    send: async (message, { db }) => {
      const target = await findSendTarget(db, message.address);
      if (!target) return { ok: false, permanent: true, category: "subscription_missing" };
      const rendered = JSON.parse(message.text) as Pick<PushPayload, "title" | "body" | "link" | "locale" | "dir">;
      const payload: PushPayload = {
        notificationId: message.notificationId,
        ...rendered,
        unread: await unreadCountOf(db, target.userId),
        mustShow: isAppleEndpoint(target.endpoint),
      };
      const subscription = { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } };
      const body = JSON.stringify(payload);
      const topic = pushTopicFor(message.eventKey);
      let result = await post(subscription, body, topic);
      // A push service that rejects the `Topic` header answers 400: the push is sent again without it.
      if (!result.ok && result.category === "push_rejected") result = await post(subscription, body, null);
      if (result.ok) await markSuccess(db, target.id);
      else await markFailure(db, target.id);
      return result;
    },
    // 404/410: that device is gone for good. The worker calls this for a `recipient_rejected` result.
    onRecipientRejected: (db, address) => removeGoneSubscription(db, address),
    // The worker's hourly tidy: devices with no success for 90 days go.
    purge: (db) => purgeStalePushSubscriptions(db),
    // A VAPID-signed empty push to a made-up FCM subscription: the push service checks the signature before it looks
    // the subscription up, so 404/410 means "credentials accepted, device unknown" and is healthy.
    probe: async () => {
      const endpoint = deps.probeEndpoint ?? `${PROBE_ENDPOINT_BASE}${randomBytes(48).toString("base64url")}`;
      const result = await post({ endpoint, keys: { p256dh: "", auth: "" } }, null, null);
      if (!result.ok && result.category === "recipient_rejected") return { ok: true };
      return result;
    },
  };
}
