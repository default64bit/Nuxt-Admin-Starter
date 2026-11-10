import dotenv from "dotenv";
import pg from "pg";
import type { Page } from "@playwright/test";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { expect, test } from "./support/test";

// The Users pages through the real server (.specs/users-and-roles/spec.md): the list with its search and filters,
// creating a User with a Role, the User page (edit names, edit roles, disable, enable), the own-account state, and
// axe plus the layout direction in both locales. Guards are covered by the Users API integration test.
dotenv.config({ quiet: true });
test.describe.configure({ mode: "serial" });

const TAG = `e2eusr${Date.now()}`;
let manager: AdminAccount;
let viewer: AdminAccount;
let pool: pg.Pool;
let managerId: string;
let targetId: string;
const ids: Record<string, string> = {};
const createdPhones = ["+989125550410"];

const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as Record<string, unknown>[];
const rolesOf = async (userId: string) => (await q("SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.name", [userId])).map((row) => row.name as string);

test.beforeAll(async () => {
  manager = await createAdminAccount("+989125550401", { permissions: ["view-users", "create-users", "edit-users", "disable-users", "view-roles", "manage-roles"] });
  viewer = await createAdminAccount("+989125550402", { permissions: ["view-users"] });
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  managerId = String((await q("SELECT id FROM users WHERE phone_e164 = '+989125550401'"))[0]!.id);
  for (const [key, name] of [
    ["support", `Support ${TAG}`],
    ["spare", `Spare ${TAG}`],
  ] as const) {
    ids[key] = String((await q("INSERT INTO roles (name) VALUES ($1) RETURNING id", [name]))[0]!.id);
  }
  // A User who is signed in somewhere, to see a disable end the session.
  const target = await q("INSERT INTO users (phone_e164, phone_verified_at, given_name, family_name) VALUES ('+989125550411', now(), $1, 'Target') RETURNING id", [`${TAG}Sam`]);
  targetId = String(target[0]!.id);
  await q("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [targetId, ids.support]);
  await q("INSERT INTO auth_sessions (user_id, token_hash, idle_expires_at, absolute_expires_at) VALUES ($1, $2, now() + interval '20 minutes', now() + interval '8 hours')", [targetId, `hash-${TAG}`]);
});
test.afterAll(async () => {
  const doomed = (await q("SELECT id FROM users WHERE id = $1 OR phone_e164 = ANY($2)", [targetId, createdPhones])).map((row) => row.id);
  await q("DELETE FROM auth_sessions WHERE user_id = ANY($1)", [doomed]);
  await q("DELETE FROM user_roles WHERE user_id = ANY($1)", [doomed]);
  await q("DELETE FROM users WHERE id = ANY($1)", [doomed]);
  await q("DELETE FROM roles WHERE name LIKE $1", [`%${TAG}%`]);
  await pool?.end();
  for (const account of [manager, viewer]) await account?.cleanup();
});

const rows = (page: Page) => page.locator("tbody tr");
const toast = (page: Page) => page.locator("[data-sonner-toast]").first();
const sw = (page: Page, name: string) => page.getByRole("switch", { name, exact: true });

test("the list: columns without a type, search, the Status filter, New user only for who may create", async ({ page }) => {
  await manager.signIn(page);
  await gotoHydrated(page, "/en/admin/users");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Users");
  await expect(page.getByRole("columnheader")).toHaveText(["Name", "Phone", "Roles", "Status", "Joined", "Last active"]);
  await expect(page.locator('[data-slot="new-user"]')).toBeVisible();

  await page.getByRole("searchbox", { name: "Search users" }).fill(TAG.toUpperCase());
  await expect(page).toHaveURL(/q=/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(`${TAG}Sam Target`);
  await expect(rows(page).first()).toContainText(`Support ${TAG}`);
  await expect(rows(page).first().locator("[dir=ltr]")).toHaveText("0912 555 0411");
  await expect(rows(page).first()).toContainText("Active");

  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Disabled" }).click();
  await expect(page).toHaveURL(/status=disabled/);
  await expect(page.getByText("No users match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page).toHaveURL(/\/en\/admin\/users$/);

  await page.getByRole("searchbox", { name: "Search users" }).fill("0912 555 0411");
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().getByRole("cell").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/en/admin/users/${targetId}$`));

  await viewer.signIn(page);
  await gotoHydrated(page, "/en/admin/users");
  await expect(rows(page).first()).toBeVisible();
  await expect(page.locator('[data-slot="new-user"]')).toHaveCount(0);
});

test("create a User: both names or neither, at least one Role, and a repeated phone opens that account", async ({ page }) => {
  await manager.signIn(page);
  await gotoHydrated(page, "/en/admin/users");
  await page.locator('[data-slot="new-user"]').click();
  const dialog = page.locator('[data-slot="user-create-dialog"]');
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Enter a phone number." })).toBeVisible();
  await expect(dialog.getByRole("alert").filter({ hasText: "Choose at least one role." })).toBeVisible();

  await dialog.getByLabel("Phone").fill("0912 555 0410");
  await dialog.getByLabel("Given name").fill("Mina");
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "This field is required." })).toBeVisible(); // the family name
  await dialog.getByLabel("Family name").fill("Karimi");
  await sw(page, `Support ${TAG}`).click();
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(toast(page)).toContainText("User created");
  await expect(page).toHaveURL(/\/en\/admin\/users\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mina Karimi");
  await expect(page.locator('[data-slot="roles"]')).toContainText(`Support ${TAG}`);
  const [created] = await q("SELECT id, phone_verified_at FROM users WHERE phone_e164 = '+989125550410'");
  expect(created!.phone_verified_at).toBeNull(); // verified at their first sign-in
  expect(await rolesOf(String(created!.id))).toEqual([`Support ${TAG}`]);

  await gotoHydrated(page, "/en/admin/users");
  await page.locator('[data-slot="new-user"]').click();
  await dialog.getByLabel("Phone").fill("09125550410");
  await sw(page, `Spare ${TAG}`).click();
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(dialog.locator('[data-slot="phone-in-use"]')).toContainText("already exists");
  await dialog.getByRole("link", { name: "Open that account" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/admin/users/${created!.id}$`));
});

test("the User page: edit names, edit roles, disable ends the session, enable", async ({ page }) => {
  await manager.signIn(page);
  await gotoHydrated(page, `/en/admin/users/${targetId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${TAG}Sam Target`);
  await expect(page.locator('[data-slot="active-sessions"]')).toHaveText("1");
  await expect(page.locator('[data-slot="user-badges"] [dir=ltr]')).toHaveText("0912 555 0411");

  await page.getByRole("button", { name: "Edit names" }).click();
  const names = page.locator('[data-slot="user-names-dialog"]');
  await names.getByLabel("Given name").fill(" ");
  await names.getByRole("button", { name: "Save names" }).click();
  await expect(names.getByRole("alert")).toContainText("This field is required.");
  await names.getByLabel("Given name").fill(`Samira`);
  await names.getByRole("button", { name: "Save names" }).click();
  await expect(toast(page)).toContainText("Names saved");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Samira Target`);

  await page.getByRole("button", { name: "Edit roles" }).click();
  const roles = page.locator('[data-slot="user-roles-dialog"]');
  await expect(sw(page, `Support ${TAG}`)).toBeChecked();
  await sw(page, `Support ${TAG}`).click();
  await roles.getByRole("button", { name: "Save roles" }).click();
  await expect(roles.getByRole("alert")).toContainText("Choose at least one role.");
  await sw(page, `Spare ${TAG}`).click();
  await roles.getByRole("button", { name: "Save roles" }).click();
  await expect(toast(page)).toContainText("Roles saved");
  await expect(page.locator('[data-slot="roles"]')).toHaveText(`Spare ${TAG}`);
  expect(await rolesOf(targetId)).toEqual([`Spare ${TAG}`]);

  // A change made elsewhere meanwhile: the action is refused as stale and the page reloads.
  await q("UPDATE users SET given_name = $2, updated_at = now() WHERE id = $1", [targetId, `Elsewhere`]);
  await page.getByRole("button", { name: "Disable user" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disable" }).click();
  await expect(toast(page)).toContainText("changed by someone else");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Elsewhere Target`);
  expect((await q("SELECT status FROM users WHERE id = $1", [targetId]))[0]!.status).toBe("active");

  await page.getByRole("button", { name: "Disable user" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(`Disable Elsewhere Target?`);
  await page.getByRole("alertdialog").getByRole("button", { name: "Disable" }).click();
  await expect(toast(page)).toContainText("User disabled");
  await expect(page.locator('[data-slot="user-status"]')).toHaveText("Disabled");
  await expect(page.locator('[data-slot="active-sessions"]')).toHaveText("0");
  await expect(page.getByRole("button", { name: "Disable user" })).toHaveCount(0);
  expect((await q("SELECT revoked_reason FROM auth_sessions WHERE user_id = $1", [targetId]))[0]!.revoked_reason).toBe("account_disabled");

  await page.getByRole("button", { name: "Enable user" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Enable" }).click();
  await expect(toast(page)).toContainText("User enabled");
  await expect(page.locator('[data-slot="user-status"]')).toHaveText("Active");
});

test("your own page offers no disable and no role change, and an unknown id says so", async ({ page }) => {
  await manager.signIn(page);
  await gotoHydrated(page, `/en/admin/users/${managerId}`);
  await expect(page.locator('[data-slot="user-badges"]')).toContainText("You");
  await expect(page.getByRole("button", { name: "Edit names" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disable user" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit roles" })).toHaveCount(0);

  await gotoHydrated(page, "/en/admin/users/00000000-0000-4000-8000-000000000000");
  await expect(page.locator('[data-slot="user-not-found"]')).toContainText("User not found");
});

for (const [prefix, dir, name, newLabel, editLabel] of [
  ["", "rtl", "fa", "کاربر جدید", "ویرایش نقش‌ها"],
  ["/en", "ltr", "en", "New user", "Edit roles"],
] as const) {
  test(`axe and layout direction: the list, a User page and the dialogs, ${dir.toUpperCase()} (${name})`, async ({ page }) => {
    await manager.signIn(page);
    await gotoHydrated(page, `${prefix}/admin/users`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(rows(page).first()).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: newLabel }).click();
    await expect(page.locator('[data-slot="user-create-dialog"]')).toBeVisible();
    await expect(sw(page, `Support ${TAG}`)).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");

    await gotoHydrated(page, `${prefix}/admin/users/${targetId}`);
    await expect(page.locator('[data-slot="access-card"]')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: editLabel }).click();
    await expect(page.locator('[data-slot="user-roles-dialog"]')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
    // On a phone the page does not scroll sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
