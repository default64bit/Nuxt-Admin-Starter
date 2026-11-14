import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { expect, test } from "./support/test";

// Web Push and the admin PWA with no VAPID keys (the Off state): the push Channel reads "not configured" with its switch
// disabled and no browser-push card or banner, the per-locale manifest is served to a signed-in User only, and axe holds
// in both locales.
let account: AdminAccount;
test.beforeAll(async () => {
  account = await createAdminAccount("+989125550381", { permissions: [] });
});
test.afterAll(async () => account?.cleanup());

test("not configured push shows no card or banner, the manifest is served per locale, and axe holds in fa and en", async ({ page }) => {
  await account.signIn(page);

  for (const [prefix, lang, scope] of [
    ["/en", "en", "/en/admin"],
    ["", "fa", "/admin"],
  ] as const) {
    await gotoHydrated(page, `${prefix}/admin/account/notifications`);
    const channel = page.locator("[data-slot='channel-push']");
    await expect(channel).toBeVisible();
    await expect(channel.locator("[data-slot='channel-state']")).toBeVisible();
    await expect(channel.getByRole("switch")).toBeDisabled();
    await expect(page.locator("[data-slot='device-push']")).toHaveCount(0);
    await expect(page.locator("[data-slot='admin-push-banner']")).toHaveCount(0);
    await expect(page.locator("link[rel='manifest']")).toHaveAttribute("href", `${scope}/manifest.webmanifest`);

    const manifest = await page.request.get(`${scope}/manifest.webmanifest`);
    expect(manifest.status()).toBe(200);
    expect(await manifest.json()).toMatchObject({ scope, lang, display: "standalone" });
    await expectNoAxeViolations(page);
  }
});

test("a guest gets a plain 404 for the manifest and the worker", async ({ request }) => {
  expect((await request.get("/admin/manifest.webmanifest")).status()).toBe(404);
  expect((await request.get("/en/admin/sw.js")).status()).toBe(404);
});
