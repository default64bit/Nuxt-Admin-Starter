// @vitest-environment node
import * as webpush from "web-push";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { channelAvailability, recordSend } from "../../../server/notifications/channel-health";
import { createPushChannel } from "../../../server/notifications/push/channel";
import { resolvePushConfig } from "../../../server/notifications/push/config";
import { startFakePush, type FakePush } from "../../fixtures/fake-push";
import { dbSuite, useTestDatabase } from "../support/database";

// The Web Push adapter against the local fake push service and a real database: a send is encrypted, carries the
// message and marks the device; a 410 means the device is gone; a rejected VAPID signature trips the breaker at once.
dbSuite("Web Push Channel", () => {
  const database = useTestDatabase();
  const vapid = webpush.generateVAPIDKeys();
  const channel = createPushChannel(resolvePushConfig({ NUXT_VAPID_PUBLIC_KEY: vapid.publicKey, NUXT_VAPID_PRIVATE_KEY: vapid.privateKey, NUXT_VAPID_SUBJECT: "mailto:ops@example.com" }));
  const q = async (sql: string, params: unknown[] = []) => (await database.pool.query(sql, params)).rows;
  let fake: FakePush;
  let userId: string;

  beforeAll(async () => {
    fake = await startFakePush();
  });
  afterAll(async () => fake.close());
  beforeEach(async () => {
    fake.clear();
    await database.truncate();
    [{ id: userId }] = await q("INSERT INTO users (phone_e164, phone_verified_at) VALUES ('+989120000380', now()) RETURNING id");
  });

  async function device() {
    const sub = fake.subscribe();
    const [row] = await q("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, locale_scope, device_label) VALUES ($1, $2, $3, $4, 'en', 'Chrome on Linux') RETURNING id", [userId, sub.endpoint, sub.p256dh, sub.auth]);
    return { id: row.id as string, path: new URL(sub.endpoint).pathname };
  }
  const message = (address: string) => ({ address, text: JSON.stringify({ title: "Title", body: "Body", link: null, locale: "en", dir: "ltr" }), eventKey: "example.event", locale: "en" as const, link: null, notificationId: null });
  const log = () => undefined;

  it("sends one encrypted push per device and marks the device delivered", async () => {
    const one = await device();
    expect(await channel.addressesFor(database.db, userId)).toEqual([one.id]);
    expect(await channel.send(message(one.id), { db: database.db })).toEqual({ ok: true });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({ path: one.path, decrypted: true, payload: { title: "Title", body: "Body", locale: "en", dir: "ltr", unread: 0 } });
    expect(fake.requests[0]!.headers.topic).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    expect((await q("SELECT last_success_at FROM push_subscriptions WHERE id = $1", [one.id]))[0].last_success_at).not.toBeNull();
  });

  it("reports a gone device as rejected for good and drops only that device", async () => {
    const gone = await device();
    const kept = await device();
    fake.script({ status: 410 }, `${fake.url}${gone.path}`);
    const result = await channel.send(message(gone.id), { db: database.db });
    expect(result).toEqual({ ok: false, permanent: true, category: "recipient_rejected" });
    await channel.onRecipientRejected!(database.db, gone.id);
    expect(await channel.addressesFor(database.db, userId)).toEqual([kept.id]);
  });

  it("trips the breaker on one credential failure and restores it when the probe succeeds", async () => {
    const one = await device();
    expect(await channelAvailability(database.db, channel)).toBe("operational");
    fake.script({ status: 403 });
    const failed = await channel.send(message(one.id), { db: database.db });
    expect(failed).toMatchObject({ ok: false, category: "credential_failure" });
    await recordSend(database.db, channel, failed, log);
    expect(await channelAvailability(database.db, channel)).toBe("degraded");
    // The probe is a signed empty push to a made-up subscription; a 404 means the signature was accepted.
    const probing = createPushChannel(resolvePushConfig({ NUXT_VAPID_PUBLIC_KEY: vapid.publicKey, NUXT_VAPID_PRIVATE_KEY: vapid.privateKey, NUXT_VAPID_SUBJECT: "mailto:ops@example.com" }), { probeEndpoint: `${fake.url}/push/made-up` });
    const probe = await probing.probe();
    expect(probe).toEqual({ ok: true });
    await recordSend(database.db, channel, probe, log);
    expect(await channelAvailability(database.db, channel)).toBe("operational");
  });
});
