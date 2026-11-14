import type { Page } from "@playwright/test";
import { ADMIN_NAV } from "../../shared/constants/admin-nav";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { expect, test } from "./support/test";

// The admin shell end to end (.specs/admin-shell/spec.md): Permission-filtered navigation, the user menu (dark mode
// toggle, language switch), axe in both locales, and right-to-left / left-to-right layout on desktop and phone.
// Needs a server with the mock SMS adapter and a database; `just test-e2e-sharded` provides both.
test.describe.configure({ mode: "serial" });

let superUser: AdminAccount;
let limited: AdminAccount;
test.beforeAll(async () => {
  superUser = await createAdminAccount("+989125550291", { givenName: "Sara" });
  limited = await createAdminAccount("+989125550292", { permissions: ["view-users"] });
});
test.afterAll(async () => {
  await superUser?.cleanup();
  await limited?.cleanup();
});

const navLinks = (page: Page) => page.locator('[data-slot="sidebar-content"] a');
const userMenu = (page: Page) => page.locator('[data-slot="admin-user-menu-trigger"]');

for (const [prefix, dir, lang] of [
  ["", "rtl", "fa"],
  ["/en", "ltr", "en"],
] as const) {
  test(`a User with every Permission sees every destination and each opens its page, ${dir.toUpperCase()} (${lang})`, async ({ page }) => {
    await superUser.signIn(page);
    await gotoHydrated(page, `${prefix}/admin`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(navLinks(page)).toHaveCount(ADMIN_NAV.length);
    // The Dashboard has no group heading; every other group that holds an item does.
    await expect(page.locator('[data-slot="sidebar-group-label"]')).toHaveCount(new Set(ADMIN_NAV.map((entry) => entry.group)).size - 1);
    // The sidebar sits on the start side: right in RTL, left in LTR.
    const sidebar = await page.locator('[data-slot="sidebar-container"]').boundingBox();
    const viewport = page.viewportSize()!;
    expect(sidebar!.x + sidebar!.width / 2 > viewport.width / 2).toBe(dir === "rtl");
    await expectNoAxeViolations(page);

    for (const item of ADMIN_NAV.filter((entry) => entry.permission)) {
      const response = await page.goto(`${prefix}${item.path}`);
      expect(response?.status(), item.path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.locator('[data-slot="sidebar-content"] a[aria-current="page"]')).toHaveAttribute("href", `${prefix}${item.path}`);
    }
    await expectNoAxeViolations(page);
  });
}

test("a User without a Permission neither sees the item nor reaches the page (403)", async ({ page }) => {
  await limited.signIn(page);
  await gotoHydrated(page, "/en/admin");
  await expect(navLinks(page)).toHaveText(["Dashboard", "Users"]);
  expect((await page.goto("/en/admin/users"))?.status()).toBe(200);
  const denied = await page.goto("/en/admin/roles");
  expect(denied?.status()).toBe(403);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Access denied");
  await expectNoAxeViolations(page);
  const persian = await page.goto("/admin/audit-log");
  expect(persian?.status()).toBe(403);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectNoAxeViolations(page);
});

test("the user menu toggles dark mode between two states and switches the language", async ({ page }) => {
  await superUser.signIn(page);
  await page.emulateMedia({ colorScheme: "light" });
  await gotoHydrated(page, "/en/admin/users");

  await userMenu(page).click();
  await expect(page.locator('[data-slot="admin-user-label"]')).toHaveText("Sara");
  const theme = page.locator('[data-slot="admin-theme-item"]');
  await expect(theme).toHaveAttribute("aria-checked", "false");
  await theme.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(theme).toHaveAttribute("aria-checked", "true");
  await theme.click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await theme.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.keyboard.press("Escape");
  await expectNoAxeViolations(page); // the page in dark mode, menu closed

  // The choice survives a reload, painted before the page shows.
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(userMenu(page)).toBeVisible();

  await userMenu(page).click();
  await page.locator('[data-slot="admin-language-trigger"]').click();
  await page.locator('[data-slot="admin-language-option"][hreflang="fa"]').click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page).not.toHaveURL(/\/en\//);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", /fa/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("کاربران");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectNoAxeViolations(page);
});

for (const [prefix, dir] of [
  ["", "rtl"],
  ["/en", "ltr"],
] as const) {
  test(`on a phone the sidebar opens as a sheet from the start side, ${dir.toUpperCase()}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await superUser.signIn(page);
    await gotoHydrated(page, `${prefix}/admin`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCount(0);
    await page.locator('[data-slot="sidebar-trigger"]').click();
    const sheet = page.locator('[data-slot="sidebar"][data-mobile="true"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-slot="sidebar-content"] a')).toHaveCount(ADMIN_NAV.length);
    const box = (await sheet.boundingBox())!;
    expect(box.x + box.width / 2 > 195).toBe(dir === "rtl");
    await expectNoAxeViolations(page);
  });
}
