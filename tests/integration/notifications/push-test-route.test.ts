// @vitest-environment node
import { fileURLToPath } from "node:url";
import { fetch, setup } from "@nuxt/test-utils/e2e";
import * as webpush from "web-push";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startFakePush } from "../../fixtures/fake-push";
import { dbSuite, useTestDatabase } from "../support/database";

// "Send test notification" through the built server (ADR-0028): this browser only, at most once per 30 seconds, and
// nothing behind it: no Inbox item, outbox row or audit entry. Push runs against the local fake push service.
dbSuite("Web Push test notification route", async () => {
  const database = useTestDatabase();
  const ORIGIN = "http://localhost:3000";
  const vapid = webpush.generateVAPIDKeys();
  const fake = await startFakePush();
  Object.assign(process.env, { NUXT_VAPID_PUBLIC_KEY: vapid.publicKey, NUXT_VAPID_PRIVATE_KEY: vapid.privateKey, NUXT_VAPID_SUBJECT: "mailto:ops@example.com" });
  delete process.env.NUXT_ADMIN_CHANNEL_PUSH_ENABLED;
  afterAll(async () => fake.close());

  await setup({
    rootDir: fileURLToPath(new URL("../../..", import.meta.url)),
    server: true,
    setupTimeout: 240_000,
    nuxtConfig: {
      runtimeConfig: {
        appEnv: "test",
        databaseUrl: database.url,
        session: { password: "test-session-password-0123456789abcdef" },
        ipHashSecret: "test-ip-hash-secret-0123456789abcdef",
        public: { siteUrl: ORIGIN },
      },
    },
  });

  const q = async (sql: string, params: unknown[] = []) => (await database.pool.query(sql, params)).rows;
  const json = { "content-type": "application/json", origin: ORIGIN };
  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    fetch(path, { method, redirect: "manual", ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { ...json, ...(cookie ? { cookie } : {}) } });

  async function signIn(phone: string) {
    const [user] = await q("INSERT INTO users (phone_e164, phone_verified_at) VALUES ($1, now()) RETURNING id", [phone]);
    await q("DELETE FROM otp_send_events");
    const requested = await call("POST", "/api/v1/auth/otp/request", undefined, { phone, locale: "en" });
    const { testCode } = (await requested.json()) as { testCode: string };
    const verified = await call("POST", "/api/v1/auth/otp/verify", undefined, { phone, code: testCode });
    return { id: user.id as string, cookie: (verified.headers.get("set-cookie") ?? "").split(";")[0]! };
  }
  async function device(userId: string) {
    const sub = fake.subscribe();
    const [row] = await q("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, locale_scope, device_label) VALUES ($1, $2, $3, $4, 'en', 'Chrome on Linux') RETURNING id", [userId, sub.endpoint, sub.p256dh, sub.auth]);
    return row.id as string;
  }

  let alice: Awaited<ReturnType<typeof signIn>>;
  let bob: Awaited<ReturnType<typeof signIn>>;
  beforeAll(async () => {
    alice = await signIn("+989120000391");
    bob = await signIn("+989120000392");
  });

  it("is refused without a session and for another User's device", async () => {
    const aliceDevice = await device(alice.id);
    expect((await call("POST", `/api/v1/admin/account/push-subscriptions/${aliceDevice}/test`)).status).toBe(401);
    expect((await call("POST", `/api/v1/admin/account/push-subscriptions/${aliceDevice}/test`, bob.cookie, {})).status).toBe(404);
    expect(fake.requests).toHaveLength(0);
  });

  it("pushes the test text to this browser once, then waits 30 seconds, and writes no Inbox item, outbox row or audit entry", async () => {
    const id = await device(alice.id);
    const first = await call("POST", `/api/v1/admin/account/push-subscriptions/${id}/test`, alice.cookie, {});
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ result: "sent" });
    expect(fake.requests.at(-1)).toMatchObject({ decrypted: true, payload: { title: "اعلان آزمایشی", locale: "fa" } });

    const second = await call("POST", `/api/v1/admin/account/push-subscriptions/${id}/test`, alice.cookie, {});
    expect(second.status).toBe(429);
    expect(fake.requests).toHaveLength(1);

    expect(await q("SELECT 1 FROM notifications")).toHaveLength(0);
    expect(await q("SELECT 1 FROM notification_outbox")).toHaveLength(0);
    expect(await q("SELECT 1 FROM admin_audit_events WHERE entity_type LIKE '%push%'")).toHaveLength(0);
  });

  it("hands the VAPID public key to the settings page and never the private one", async () => {
    const response = await call("GET", "/api/v1/admin/account/notification-settings", alice.cookie);
    const settings = (await response.json()) as { vapidPublicKey?: string; channels: { key: string; availability: string }[] };
    expect(settings.vapidPublicKey).toBe(vapid.publicKey);
    expect(settings.channels.find((channel) => channel.key === "push")?.availability).toBe("operational");
    expect(JSON.stringify(settings)).not.toContain(vapid.privateKey);
  });
});
