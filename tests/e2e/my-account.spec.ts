import type { Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { expect, test } from "./support/test";

dotenv.config({ quiet: true });

// My account end to end (.specs/users-and-roles/spec.md): opened from the user menu by a User who holds no
// Permission, name edit, and phone change through a code sent to the new number (the mock SMS adapter returns it).
// Axe runs in Persian and English with the dialog closed and open; RTL / LTR is checked on the page itself.
test.describe.configure({ mode: "serial" });

const NAME_PHONE = "+989125550311";
const CHANGE_PHONE = "+989125550312";
const NEW_PHONE = "+989125550313";

let reader: AdminAccount;
let changer: AdminAccount;
test.beforeAll(async () => {
  // Empty Permissions: the page must open without any page Permission.
  reader = await createAdminAccount(NAME_PHONE, { permissions: [], givenName: "Sara" });
  changer = await createAdminAccount(CHANGE_PHONE, { permissions: [] });
});
test.afterAll(async () => {
  await reader?.cleanup();
  // The phone change moves the account to NEW_PHONE; put it back so cleanup finds it.
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("UPDATE users SET phone_e164 = $1 WHERE phone_e164 = $2", [CHANGE_PHONE, NEW_PHONE]).catch(() => undefined);
  await pool.end();
  await changer?.cleanup();
});

const COPY = {
  fa: { prefix: "", dir: "rtl", title: "حساب من", digits: "۰۹۱۲ ۵۵۵ ۰۳۱۱", required: "این فیلد الزامی است.", saved: "نام شما ذخیره شد." },
  en: { prefix: "/en", dir: "ltr", title: "My account", digits: "0912 555 0311", required: "This field is required.", saved: "Your name was saved." },
} as const;

const userMenu = (page: Page) => page.locator('[data-slot="admin-user-menu-trigger"]');
const dialog = (page: Page) => page.locator('[data-slot="phone-change"]');

for (const lang of ["fa", "en"] as const) {
  const copy = COPY[lang];

  test(`opens from the user menu for a User with no Permission, ${copy.dir.toUpperCase()}, with no axe violations (${lang})`, async ({ page }) => {
    await reader.signIn(page);
    await gotoHydrated(page, `${copy.prefix}/admin`);
    await userMenu(page).click();
    await page.getByRole("menuitem", { name: copy.title }).click();
    await expect(page).toHaveURL(`${copy.prefix}/admin/account`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);
    await expect(page.locator("html")).toHaveAttribute("dir", copy.dir);
    await expect(page.locator('[data-slot="account-form"]')).toBeVisible();
    await expect(page.locator('input[name="givenName"]')).toHaveValue("Sara");
    // The phone stays left-to-right in both languages and cannot be typed into.
    const phone = page.locator('input[name="phone"]');
    await expect(phone).toHaveValue(copy.digits);
    await expect(phone).toHaveAttribute("readonly", "");
    await expect(phone).toHaveAttribute("dir", "ltr");
    await expect(page.locator('button[data-slot="account-save"]')).toBeDisabled();
    await expectNoAxeViolations(page);

    await page.locator('button[data-slot="change-phone"]').click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('input[name="phone"]')).toBeFocused();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('button[data-slot="change-phone"]')).toBeFocused();
  });
}

test("saves the names, shows the new name in the user menu and keeps it after a reload (fa)", async ({ page }) => {
  await reader.signIn(page);
  await gotoHydrated(page, "/admin/account");
  const given = page.locator('input[name="givenName"]');
  const family = page.locator('input[name="familyName"]');
  const save = page.locator('button[data-slot="account-save"]');

  // An error shows after the field is left, and Save stays off until the form is valid and changed.
  await given.fill("");
  await family.focus();
  await expect(page.locator('[data-slot="field-error"]')).toHaveText(COPY.fa.required);
  await expect(given).toHaveAttribute("aria-invalid", "true");
  await expect(save).toBeDisabled();

  await given.fill("  سارا ");
  await family.fill("احمدی   نیا");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: COPY.fa.saved })).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(given).toHaveValue("سارا");
  await expect(family).toHaveValue("احمدی نیا");
  await userMenu(page).click();
  await expect(page.locator('[data-slot="admin-user-label"]')).toHaveText("سارا احمدی نیا");
  await page.keyboard.press("Escape");

  await gotoHydrated(page, "/admin/account");
  await expect(given).toHaveValue("سارا");
  await expect(family).toHaveValue("احمدی نیا");
});

test("changes the phone with the code sent to the new number, then shows it (en)", async ({ page }) => {
  await changer.signIn(page);
  await gotoHydrated(page, "/en/admin/account");
  await page.locator('button[data-slot="change-phone"]').click();
  const field = dialog(page).locator('input[name="phone"]');
  const send = dialog(page).locator('button[data-slot="phone-change-send"]');

  // The account's own number is refused as soon as it is typed.
  await field.fill("0912 555 0312");
  await expect(dialog(page).locator('[data-slot="field-error"]')).toHaveText("This is already your number");
  await expect(send).toBeDisabled();

  await field.fill("0912 555 0313");
  await expect(send).toBeEnabled();
  await send.click();
  // Test mode fills the five boxes; nothing is submitted until the User confirms.
  await expect(dialog(page).locator('[data-slot="otp-box"]')).toHaveCount(5);
  await expect(dialog(page).locator('[data-slot="test-mode-notice"]')).toBeVisible();
  await dialog(page).locator('button[data-slot="phone-change-verify"]').click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Your phone number was changed." })).toBeVisible();
  await expect(page.locator('input[name="phone"]')).toHaveValue("0912 555 0313");
  // This session survives the change.
  const session = await page.evaluate(() => fetch("/api/v1/auth/session").then((response) => response.json()));
  expect(session).toMatchObject({ loggedIn: true });
});
