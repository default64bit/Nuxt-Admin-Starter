import type { Page } from "@playwright/test";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { expect, test } from "./support/test";

// Admin sign-in end to end (.specs/authentication/spec.md): phone, SMS code (the mock adapter fills it in test
// mode, and the test still presses Continue), the admin area, sign-out, and the message after a session ended.
// Needs a server with the mock SMS adapter and `NUXT_APP_ENV=local`; `just test-e2e-sharded` provides one.

const PHONE = "+989125550123";
const PHONE_FA_DIGITS = "۰۹۱۲۵۵۵۰۱۲۳"; // 09125550123
const CONTINUE = /Continue|ادامه/;

let account: AdminAccount;
test.beforeEach(async () => {
  account = await createAdminAccount(PHONE, { givenName: "Ada" });
});
test.afterEach(async () => {
  await account.cleanup();
});

/** Types the phone, presses Enter, waits for the five filled boxes of the code step and returns their digits. */
async function requestCode(page: Page, input: string) {
  const form = page.getByTestId("sign-in-form");
  await form.locator("input[type=tel]").fill(input);
  await form.locator("input[type=tel]").press("Enter");
  const boxes = form.locator('[data-slot="otp-box"]');
  await expect(boxes).toHaveCount(5);
  await expect(form.locator('[data-slot="test-mode-notice"]')).toBeVisible();
  return (await boxes.allInnerTexts()).join("");
}

test("@cross-browser a guest is sent to sign-in, signs in with a phone code, returns to the page, and signs out", async ({ page }) => {
  await gotoHydrated(page, "/en/admin");
  await expect(page).toHaveURL(/\/en\/sign-in\?redirect=(%2F|\/)en(%2F|\/)admin$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await expect(page.getByTestId("session-ended")).toHaveCount(0);
  await expectNoAxeViolations(page);

  const digits = await requestCode(page, "0912 555 0123");
  expect(digits).toMatch(/^\d{5}$/);
  await expect(page.getByTestId("sign-in-form").locator('[data-slot="otp-field"]')).toHaveAttribute("dir", "ltr");
  await expectNoAxeViolations(page);

  // Nothing submits by itself: the person presses Continue.
  await expect(page).toHaveURL(/sign-in/);
  await page.getByRole("button", { name: CONTINUE }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
  await page.locator('[data-slot="admin-user-menu-trigger"]').click();
  await expect(page.locator('[data-slot="admin-user-label"]')).toHaveText("Ada");

  await page.locator('[data-slot="admin-sign-out"]').click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /signed out/i })).toBeVisible();
  expect(await page.evaluate(() => fetch("/api/v1/auth/session").then((r) => r.json()))).toEqual({ loggedIn: false });
  // The admin is closed again.
  await gotoHydrated(page, "/en/admin");
  await expect(page).toHaveURL(/\/en\/sign-in\?redirect=/);
});

test("the Persian page is right-to-left, accepts Persian digits and signs in", async ({ page }) => {
  await gotoHydrated(page, "/sign-in");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", /fa/);
  await expect(page.locator("input[type=tel]")).toHaveAttribute("dir", "ltr");
  await expectNoAxeViolations(page);

  const digits = await requestCode(page, PHONE_FA_DIGITS);
  expect(digits).toMatch(/^[۰-۹]{5}$/);
  await page.getByRole("button", { name: CONTINUE }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("an unknown number gets the same code step and a wrong-code answer, never an account", async ({ page }) => {
  await gotoHydrated(page, "/en/sign-in");
  await requestCode(page, "09129998877");
  await page.getByRole("button", { name: CONTINUE }).click();
  await expect(page.getByRole("alert").filter({ hasText: /wrong/i })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/sign-in/);
});

test("a session that ended says so on sign-in", async ({ page }) => {
  await account.signIn(page);
  await gotoHydrated(page, "/en/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard");

  // 31 minutes without a request: the 30-minute idle limit has passed.
  await account.ageSessions(31);
  await gotoHydrated(page, "/en/admin");
  await expect(page).toHaveURL(/\/en\/sign-in\?redirect=(%2F|\/)en(%2F|\/)admin&reason=session-ended$/);
  await expect(page.getByTestId("session-ended")).toContainText("Your session has ended");
  await expectNoAxeViolations(page);
});
