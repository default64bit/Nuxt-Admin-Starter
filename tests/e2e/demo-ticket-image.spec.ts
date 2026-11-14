// demo-ticket:start (whole file)
import dotenv from "dotenv";
import pg from "pg";
import sharp from "sharp";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { removeDemoTickets } from "./support/demo-ticket-seed";
import { expect, test } from "./support/test";

// The demo ticket image through the real server on the in-memory object store (.specs/demo-tickets/spec.md "Image"):
// attach an image with alt text in the dialog, see its thumbnail in Cards, and axe plus the layout direction in both
// locales. The Off path (field disabled, placeholder) is covered by the integration tests.
dotenv.config({ quiet: true });
test.describe.configure({ mode: "serial" });

const TAG = `e2eimg${Date.now()}`;
let manager: AdminAccount;
let pool: pg.Pool;

test.beforeAll(async () => {
  manager = await createAdminAccount("+989125550441", { permissions: ["view-demo-tickets", "manage-demo-tickets"], givenName: `${TAG}Mina` });
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
});
test.afterAll(async () => {
  await removeDemoTickets(pool, TAG);
  await pool?.end();
  await manager?.cleanup();
});

const dialog = (page: import("@playwright/test").Page) => page.locator('[data-slot="demo-ticket-dialog"]');

test("attach an image with alt text in the dialog and see its thumbnail in Cards", async ({ page }) => {
  await manager.signIn(page);
  await gotoHydrated(page, `/en/admin/demo-tickets?q=${TAG}`);
  await page.locator('[data-slot="new-demo-ticket"]').click();
  await dialog(page).getByLabel("Title").fill(`${TAG} with image`);

  const picture = await sharp({ create: { width: 200, height: 120, channels: 3, background: "tomato" } }).png().toBuffer();
  await dialog(page).locator("#demo-ticket-image-input").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: picture });
  await expect(dialog(page).locator("img[alt='Preview of the selected image']")).toBeVisible();
  // Alt text is required once an image is set.
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(dialog(page).getByText("Enter the alt text.")).toHaveCount(2);
  await dialog(page).getByLabel("Alt text (Persian)").fill("نمونه");
  await dialog(page).getByLabel("Alt text (English)").fill("A red sample");
  await expectNoAxeViolations(page);
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(dialog(page)).toBeHidden();

  await page.locator('[data-slot="view-switch"]').getByRole("button", { name: "Cards" }).click();
  const card = page.locator('[data-slot="row-card"]').filter({ hasText: `${TAG} with image` });
  const thumbnail = card.locator('[data-slot="demo-ticket-thumbnail"]');
  await expect(thumbnail).toHaveAttribute("alt", "A red sample");
  await expect.poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

  // Reopened, the dialog shows the saved image and its alt text.
  await card.getByRole("button", { name: /Open / }).click();
  await expect(dialog(page).getByLabel("Alt text (English)")).toHaveValue("A red sample");
});

for (const [prefix, dir, name] of [
  ["/en", "ltr", "English"],
  ["", "rtl", "Persian"],
] as const) {
  test(`axe and layout direction: Cards with the thumbnail, ${dir.toUpperCase()} (${name})`, async ({ page }) => {
    await manager.signIn(page);
    await gotoHydrated(page, `${prefix}/admin/demo-tickets?q=${TAG}`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await page.locator('[data-slot="view-switch"] button').nth(1).click();
    const thumbnail = page.locator('[data-slot="demo-ticket-thumbnail"]').first();
    await expect(thumbnail).toBeVisible();
    // The thumbnail leads the card: at the start edge, so left in LTR and right in RTL.
    const box = (await thumbnail.boundingBox())!;
    const card = (await page.locator('[data-slot="row-card"]').first().boundingBox())!;
    expect(dir === "rtl" ? box.x + box.width > card.x + card.width / 2 : box.x < card.x + card.width / 2).toBe(true);
    await expectNoAxeViolations(page);
  });
}
// demo-ticket:end
