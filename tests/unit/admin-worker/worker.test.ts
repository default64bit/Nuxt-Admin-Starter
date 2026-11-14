// @vitest-environment node
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { bundleAdminWorker } from "../../../scripts/admin-worker/bundle";
import { decidePush, parsePushPayload, planClick } from "../../../shared/admin-worker/push-logic";
import { buildAdminManifest } from "../../../shared/utils/admin-pwa";

// The admin service worker: the built script (it never caches or intercepts fetches), the pure push decisions it uses,
// and the per-locale manifest (the app name comes in as a value, never from the code).
describe("the built worker script", () => {
  const source = bundleAdminWorker();

  it("has no fetch listener and no Cache Storage use, and no absolute build paths", () => {
    expect(source).not.toMatch(/["']fetch["']/);
    expect(source).not.toMatch(/\bcaches\b|CacheStorage|\bcache\.(put|add|match)/);
    expect(source).not.toContain("/home/");
  });

  it("runs in a worker-like global, listening for install, activate, push and notificationclick only", () => {
    const types: string[] = [];
    const self = { addEventListener: (type: string) => void types.push(type), skipWaiting: async () => undefined, clients: { claim: async () => undefined } };
    runInContext(source, createContext({ self }));
    expect(types).toEqual(["install", "activate", "push", "notificationclick"]);
  });
});

describe("push decisions", () => {
  const payload = parsePushPayload({ title: "Title", body: "Body", link: "/admin/notifications", locale: "en", unread: 2 })!;

  it("reads a payload leniently and refuses one without a title", () => {
    expect(payload).toMatchObject({ title: "Title", locale: "en", dir: "ltr", unread: 2, mustShow: false });
    expect(parsePushPayload({ body: "no title" })).toBeNull();
    expect(parsePushPayload("text")).toBeNull();
  });

  it("asks a focused admin window to poll instead of showing, unless the push must show", () => {
    const focused = [{ url: "https://app.example/admin", visibilityState: "visible", focused: true }];
    expect(decidePush(payload, focused)).toEqual({ kind: "poll", clientIndexes: [0] });
    expect(decidePush({ ...payload, mustShow: true }, focused)).toEqual({ kind: "show" });
    expect(decidePush(payload, [])).toEqual({ kind: "show" });
  });

  it("opens the admin link for a signed-in click and the sign-in page, returning to it, otherwise", () => {
    const base = { link: "https://app.example/en/admin/notifications", id: "n1", locale: "en" as const, origin: "https://app.example" };
    expect(planClick({ ...base, signedInAsAdmin: true })).toEqual({ kind: "admin", path: "/en/admin/notifications", markReadId: "n1" });
    expect(planClick({ ...base, signedInAsAdmin: false })).toEqual({ kind: "sign-in", path: "/en/sign-in?redirect=%2Fen%2Fadmin%2Fnotifications" });
    // A foreign link never leaves the admin.
    expect(planClick({ ...base, link: "https://evil.example/x", signedInAsAdmin: true })).toMatchObject({ path: "/en/admin" });
  });
});

describe("the admin manifest", () => {
  it("is scoped per locale and carries the app name it was given", () => {
    expect(buildAdminManifest("fa", "Admin App")).toMatchObject({ id: "/admin", scope: "/admin", start_url: "/admin", name: "Admin App", lang: "fa", dir: "rtl", display: "standalone" });
    expect(buildAdminManifest("en", "Admin App")).toMatchObject({ scope: "/en/admin", lang: "en", dir: "ltr" });
    expect(buildAdminManifest("en", "Admin App").icons.map((icon) => icon.src)).toEqual(["/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"]);
  });
});
