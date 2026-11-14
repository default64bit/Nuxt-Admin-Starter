// @vitest-environment node
import * as webpush from "web-push";
import { describe, expect, it } from "vitest";
import { classifyPushAnswer, pushTopicFor } from "../../../server/notifications/push/channel";
import { resolvePushConfig } from "../../../server/notifications/push/config";

const keys = webpush.generateVAPIDKeys();
const good = { NUXT_VAPID_PUBLIC_KEY: keys.publicKey, NUXT_VAPID_PRIVATE_KEY: keys.privateKey, NUXT_VAPID_SUBJECT: "mailto:ops@example.com" };

describe("push configuration", () => {
  it("is operational with a matching key pair and subject, not configured when absent, and disabled by the kill switch", () => {
    expect(resolvePushConfig(good)).toMatchObject({ state: "operational", errors: [] });
    expect(resolvePushConfig({})).toMatchObject({ state: "not_configured", errors: [] });
    expect(resolvePushConfig({ ...good, NUXT_ADMIN_CHANNEL_PUSH_ENABLED: "false" }).state).toBe("disabled");
  });

  it("is not configured, naming the key but never its value, for a bad or mismatched value", () => {
    const other = webpush.generateVAPIDKeys();
    for (const env of [{ ...good, NUXT_VAPID_PRIVATE_KEY: "" }, { ...good, NUXT_VAPID_PRIVATE_KEY: other.privateKey }, { ...good, NUXT_VAPID_SUBJECT: "http://example.com" }]) {
      const config = resolvePushConfig(env);
      expect(config.state).toBe("not_configured");
      expect(config.errors.length).toBeGreaterThan(0);
      for (const message of config.errors) expect(message).not.toContain(keys.privateKey);
    }
  });
});

describe("push answers", () => {
  const answer = (status: number) => classifyPushAnswer({ kind: "answer", status, retryAfter: null });

  it("maps statuses to delivery results, credentials to the breaker's category", () => {
    expect(answer(201)).toEqual({ ok: true });
    expect(answer(410)).toEqual({ ok: false, permanent: true, category: "recipient_rejected" });
    expect(answer(401)).toMatchObject({ permanent: true, category: "credential_failure" });
    expect(answer(503)).toMatchObject({ permanent: false, category: "provider_unavailable" });
  });

  it("gives every topic a URL-safe form of at most 32 characters", () => {
    expect(pushTopicFor("demo_ticket.assigned")).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
  });
});
