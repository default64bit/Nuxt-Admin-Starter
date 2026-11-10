import dotenv from "dotenv";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { expect, test } from "./support/test";

// The Dashboard on Users data (.specs/admin-dashboard/spec.md): the default layout with the New accounts module and its
// range, Customize (remove, Choose modules with a sample preview, add, Cancel and Save, kept across a reload), the
// empty state for a User who may see no module, and axe plus the layout direction in both locales. The layout rules,
// including reorder, are covered by the unit and integration tests; the registry holds one module so far.
dotenv.config({ quiet: true });
test.describe.configure({ mode: "serial" });

let viewer: AdminAccount;
let nobody: AdminAccount;
test.beforeAll(async () => {
  viewer = await createAdminAccount("+989125550601", { permissions: ["view-users"] });
  nobody = await createAdminAccount("+989125550602", { permissions: ["view-roles"] });
});
test.afterAll(async () => {
  for (const account of [viewer, nobody]) await account?.cleanup();
});

const card = (page: import("@playwright/test").Page) => page.locator('[data-dashboard-module="new-accounts"]');

test("the default Dashboard shows New accounts with a saved range and a link to Users", async ({ page }) => {
  await viewer.signIn(page);
  await gotoHydrated(page, "/en/admin");
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('[data-slot="new-accounts-total"]')).toContainText("Total accounts");
  await expect(card(page).locator('[data-slot="dashboard-range-current"]')).toHaveText("Last 30 days");

  await card(page).locator('[data-slot="dashboard-range-trigger"]').click();
  await page.locator('[data-range="today"]').click();
  await expect(card(page).locator('[data-slot="dashboard-range-current"]')).toHaveText("Today");
  await page.reload();
  await expect(card(page).locator('[data-slot="dashboard-range-current"]')).toHaveText("Today");

  await expect(card(page).getByRole("link", { name: "Open users" })).toHaveAttribute("href", "/en/admin/users");
});

test("Customize: remove, choose with a sample preview, add, and Save keeps the layout across a reload", async ({ page }) => {
  await viewer.signIn(page);
  await gotoHydrated(page, "/en/admin");
  await page.locator('[data-slot="dashboard-customize"]').click();
  await expect(page.locator('[data-slot="dashboard-edit-bar"]')).toBeVisible();

  await page.locator('[data-slot="dashboard-remove"]').click();
  await expect(card(page)).toHaveCount(0);

  await page.locator('[data-slot="dashboard-choose-modules"]').click();
  const dialog = page.locator('[data-slot="dashboard-choose-dialog"]');
  await expect(dialog.locator('[data-slot="module-sample"][data-sample-kind="sparkline"]')).toBeVisible();
  await expect(dialog.locator('[data-slot="dashboard-choose-count"]')).toContainText("0 of 1");
  await dialog.locator('[data-slot="dashboard-choose-checkbox"]').click();
  await expect(dialog.locator('[data-slot="dashboard-choose-count"]')).toContainText("1 of 1");
  await dialog.locator('[data-slot="dashboard-choose-done"]').click();
  await expect(card(page)).toBeVisible();

  // Resize through the size menu; Cancel discards, Save keeps.
  await page.locator('[data-slot="dashboard-size-trigger"]').click();
  await page.locator('[data-width="half"]').click();
  await page.locator('[data-slot="dashboard-cancel"]').click();
  await expect(page.locator('[data-module="new-accounts"]')).toHaveAttribute("data-width", "third");

  await page.locator('[data-slot="dashboard-customize"]').click();
  await page.locator('[data-slot="dashboard-size-trigger"]').click();
  await page.locator('[data-width="half"]').click();
  await page.locator('[data-slot="dashboard-save"]').click();
  await expect(page.locator('[data-slot="dashboard-edit-bar"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-module="new-accounts"]')).toHaveAttribute("data-width", "half");

  // Reset to default is a draft until Save.
  await page.locator('[data-slot="dashboard-customize"]').click();
  await page.locator('[data-slot="dashboard-reset"]').click();
  await page.locator('[data-slot="dashboard-reset-confirm"]').click();
  await page.locator('[data-slot="dashboard-save"]').click();
  await expect(page.locator('[data-slot="dashboard-edit-bar"]')).toHaveCount(0);
  await expect(page.locator('[data-module="new-accounts"]')).toHaveAttribute("data-width", "third");
});

test("a User who may see no module gets the empty message and no Customize", async ({ page }) => {
  await nobody.signIn(page);
  await gotoHydrated(page, "/en/admin");
  await expect(page.locator('[data-slot="dashboard-no-modules"]')).toBeVisible();
  await expect(page.locator('[data-slot="dashboard-customize"]')).toHaveCount(0);
});

for (const [prefix, dir, name] of [
  ["/en", "ltr", "en"],
  ["", "rtl", "fa"],
] as const) {
  test(`axe and layout direction: the Dashboard and Customize, ${dir.toUpperCase()} (${name})`, async ({ page }) => {
    await viewer.signIn(page);
    await gotoHydrated(page, `${prefix}/admin`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator('[data-slot="new-accounts-total"]')).toBeVisible();
    await expectNoAxeViolations(page);

    await page.locator('[data-slot="dashboard-customize"]').click();
    await expect(page.locator('[data-slot="dashboard-edit-bar"]')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.locator('[data-slot="dashboard-choose-modules"]').click();
    await expect(page.locator('[data-slot="dashboard-choose-dialog"]')).toBeVisible();
    await expectNoAxeViolations(page);
  });
}
