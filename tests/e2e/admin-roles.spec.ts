import dotenv from "dotenv";
import pg from "pg";
import type { Page } from "@playwright/test";
import { PERMISSION_KEYS } from "../../shared/constants/permissions";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { expect, test } from "./support/test";

// The Roles pages through the real server (.specs/users-and-roles/spec.md): the list, the two-pane Permission editor
// (group counts, prerequisite switching, bulk buttons), create / edit / stale save / delete, the `super` and
// view-only states, the confirm before removing your own access, and axe plus the layout direction in both locales.
dotenv.config({ quiet: true });
test.describe.configure({ mode: "serial" });

const TAG = `e2erole${Date.now()}`;
let manager: AdminAccount;
let selfEditor: AdminAccount;
let viewer: AdminAccount;
let superAdmin: AdminAccount;
let pool: pg.Pool;
const ids: Record<string, string> = {};
const userIds: string[] = [];

const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as Record<string, unknown>[];
const keysOf = async (roleId: string) => (await q("SELECT permission_key FROM role_permissions WHERE role_id = $1 ORDER BY permission_key", [roleId])).map((r) => r.permission_key as string);

test.beforeAll(async () => {
  manager = await createAdminAccount("+989125550301", { permissions: ["view-roles", "manage-roles", "view-users"] });
  selfEditor = await createAdminAccount("+989125550302", { permissions: ["view-roles", "manage-roles"] });
  viewer = await createAdminAccount("+989125550303", { permissions: ["view-roles"] });
  superAdmin = await createAdminAccount("+989125550304");
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  ids.selfRole = String((await q("SELECT id FROM roles WHERE name = $1", ["e2e-+989125550302"]))[0]!.id);
  ids.superRole = String((await q("SELECT id FROM roles WHERE is_super"))[0]!.id);
  const role = async (key: string, name: string, permissions: string[]) => {
    ids[key] = String((await q("INSERT INTO roles (name) VALUES ($1) RETURNING id", [name]))[0]!.id);
    for (const permission of permissions) await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)", [ids[key], permission]);
  };
  await role("support", `Support ${TAG}`, ["view-users", "edit-users"]);
  await role("held", `Held ${TAG}`, ["view-users"]);
  await role("spare", `Spare ${TAG}`, ["view-audit-log"]);
  const member = await q("INSERT INTO users (phone_e164, phone_verified_at, given_name, family_name) VALUES ('+989170000301', now(), $1, 'Member') RETURNING id", [`${TAG}Nia`]);
  userIds.push(String(member[0]!.id));
  await q("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [userIds[0], ids.held]);
});
test.afterAll(async () => {
  await q("DELETE FROM user_roles WHERE user_id = ANY($1)", [userIds]);
  await q("DELETE FROM roles WHERE name LIKE $1", [`%${TAG}%`]);
  await q("DELETE FROM users WHERE id = ANY($1)", [userIds]);
  await pool?.end();
  for (const account of [manager, selfEditor, viewer, superAdmin]) await account?.cleanup();
});

const rows = (page: Page) => page.locator("tbody tr");
const row = (page: Page, text: string) => rows(page).filter({ hasText: text });
const sw = (page: Page, name: string) => page.getByRole("switch", { name, exact: true });
const switches = (page: Page) => page.locator('[data-slot="permission-editor"]').getByRole("switch");
const group = (page: Page, id: string) => page.locator(`[data-group="${id}"]`);
const count = (page: Page, id: string) => group(page, id).locator('[data-slot="group-count"]');
const save = (page: Page) => page.getByRole("button", { name: "Save role" });

test("the list: the Super role first with its badge, counts, search, and New role only for a manager", async ({ page }) => {
  await manager.signIn(page);
  await gotoHydrated(page, "/en/admin/roles");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roles");
  await expect(rows(page).first()).toContainText("Super role");
  await expect(rows(page).first().locator('[data-slot="badge"]')).toHaveText("Super role");
  await expect(rows(page).first()).toContainText(`${PERMISSION_KEYS.length} of ${PERMISSION_KEYS.length}`);
  await expect(page.getByRole("columnheader")).toHaveText(["Name", "Permissions", "Members", "Last updated"]);
  await expect(page.locator('[data-slot="new-role"]')).toBeVisible();

  await page.getByRole("searchbox", { name: "Search roles" }).fill(TAG.toUpperCase());
  await expect(page).toHaveURL(/q=/);
  await expect(rows(page)).toHaveCount(3);
  await expect(row(page, `Held ${TAG}`)).toContainText(`1 of ${PERMISSION_KEYS.length}`);
  await expect(row(page, `Held ${TAG}`).getByRole("cell").nth(2)).toHaveText("1");
  await expect(row(page, `Support ${TAG}`)).toContainText(`2 of ${PERMISSION_KEYS.length}`);
  await expect((await rows(page).allTextContents()).map((text) => text.split(" ")[0])).toEqual(["Held", "Spare", "Support"]); // alphabetical
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page).toHaveURL(/\/en\/admin\/roles$/);
  await rows(page).first().getByRole("cell").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/en/admin/roles/${ids.superRole}$`));

  await viewer.signIn(page);
  await gotoHydrated(page, "/en/admin/roles");
  await expect(rows(page).first()).toBeVisible();
  await expect(page.locator('[data-slot="new-role"]')).toHaveCount(0);
});

test("the editor: group counts, ticking a Permission ticks what it needs, and a needed one cannot be turned off", async ({ page }) => {
  await manager.signIn(page);
  await gotoHydrated(page, `/en/admin/roles/${ids.spare}`);
  await expect(page.getByLabel("Role name")).toHaveValue(`Spare ${TAG}`);
  await expect(page.locator('[data-slot="permission-groups"] button')).toHaveCount(3);
  await expect(group(page, "users")).toHaveAttribute("aria-current", "true");
  await expect(count(page, "users")).toHaveText("0/4");
  await expect(count(page, "audit")).toHaveText("1/1");

  await sw(page, "Edit users").click();
  await expect(sw(page, "View users")).toBeChecked();
  await expect(sw(page, "View users")).toBeDisabled();
  await expect(page.locator('[data-permission="view-users"] [data-slot="needed-by"]')).toHaveText("Can't turn off: needed by Edit users");
  await sw(page, "Edit users").click();
  await expect(sw(page, "View users")).toBeEnabled();

  // A prerequisite in the same group, shown on a second group; the count follows.
  await group(page, "roles").click();
  await expect(group(page, "roles")).toHaveAttribute("aria-current", "true");
  await sw(page, "Manage roles").click();
  await expect(sw(page, "View roles")).toBeChecked();
  await expect(count(page, "roles")).toHaveText("2/2");
  await expect(sw(page, "View roles")).toBeDisabled();

  // Allow all, then Clear group; "Allow all in Users" also keeps nothing it does not need.
  await group(page, "users").click();
  await page.locator('[data-slot="group-bulk"]').click();
  await expect(count(page, "users")).toHaveText("4/4");
  await expect(page.locator('[data-slot="group-bulk"]')).toHaveText("Clear group");
  await page.locator('[data-slot="group-bulk"]').click();
  await expect(count(page, "users")).toHaveText("0/4");
  expect(await keysOf(ids.spare)).toEqual(["view-audit-log"]); // nothing was saved

  // Reset returns to the stored Role.
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(count(page, "roles")).toHaveText("0/2");
});

test("create, edit, stale save and delete", async ({ page }) => {
  await manager.signIn(page);
  await gotoHydrated(page, "/en/admin/roles/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New role");
  await expect(save(page)).toBeDisabled();
  await page.getByLabel("Role name").fill("a");
  await save(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "at least 2 characters" })).toBeVisible();
  await page.getByLabel("Role name").fill(` support ${TAG.toLowerCase()} `);
  await save(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();

  const fresh = `Fresh ${TAG}`;
  await page.getByLabel("Role name").fill(fresh);
  await group(page, "roles").click();
  await sw(page, "Manage roles").click();
  await save(page).click();
  await expect(page.locator("[data-sonner-toast]").first()).toContainText("Role created");
  await expect(page).toHaveURL(/\/en\/admin\/roles\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(fresh);
  ids.fresh = String((await q("SELECT id FROM roles WHERE name = $1", [fresh]))[0]!.id);
  expect(await keysOf(ids.fresh)).toEqual(["manage-roles", "view-roles"]); // the prerequisite was saved with it

  // Edit: a rename shows in the heading; a save made on a version someone else moved past reloads the Role.
  await gotoHydrated(page, `/en/admin/roles/${ids.support}`);
  await sw(page, "Disable and re-enable users").click();
  await page.getByLabel("Role name").fill(`Care ${TAG}`);
  await save(page).click();
  await expect(page.locator("[data-sonner-toast]").first()).toContainText("Role saved");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Care ${TAG}`);
  expect(await keysOf(ids.support)).toEqual(["disable-users", "edit-users", "view-users"]);
  await expect(save(page)).toBeDisabled(); // nothing left to save
  await q("UPDATE roles SET name = $2, updated_at = now() WHERE id = $1", [ids.support, `Care2 ${TAG}`]);
  await page.getByLabel("Role name").fill(`Care3 ${TAG}`);
  await save(page).click();
  await expect(page.locator("[data-sonner-toast]").first()).toContainText("changed by someone else");
  await expect(page.getByLabel("Role name")).toHaveValue(`Care2 ${TAG}`);

  // Delete: a held Role is refused with the message, an unheld one goes.
  await gotoHydrated(page, `/en/admin/roles/${ids.held}`);
  const member = page.locator('[data-slot="role-member"]');
  await expect(member).toContainText(`${TAG}Nia Member`);
  await expect(member.locator("[dir=ltr]")).toHaveText("0917 000 0301");
  await page.getByRole("button", { name: "Delete role" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.locator('[data-slot="delete-blocked"]')).toHaveText("Can't delete: 1 user holds this role. Remove it from them first.");
  expect(await q("SELECT 1 FROM roles WHERE id = $1", [ids.held])).toHaveLength(1);

  await gotoHydrated(page, `/en/admin/roles/${ids.fresh}`);
  await page.getByRole("button", { name: "Delete role" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(`Delete ${fresh}?`);
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("[data-sonner-toast]").first()).toContainText("Role deleted");
  await expect(page).toHaveURL(/\/en\/admin\/roles$/);
  expect(await q("SELECT 1 FROM roles WHERE id = $1", [ids.fresh])).toEqual([]);
});

test("the Super role and a view-only User see everything disabled, with a note and no footer", async ({ page }) => {
  await superAdmin.signIn(page);
  await gotoHydrated(page, `/en/admin/roles/${ids.superRole}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Super role");
  await expect(page.locator('[data-slot="super-note"]')).toBeVisible();
  await expect(page.getByLabel("Role name")).toBeDisabled();
  await expect(switches(page)).toHaveCount(4); // the first group's rows
  for (const swtch of await switches(page).all()) {
    await expect(swtch).toBeChecked();
    await expect(swtch).toBeDisabled();
  }
  await expect(count(page, "audit")).toHaveText("1/1");
  await expect(page.locator('[data-slot="group-bulk"]')).toBeDisabled();
  await expect(page.locator('[data-slot="role-footer"]')).toHaveCount(0);

  await viewer.signIn(page);
  await gotoHydrated(page, `/en/admin/roles/${ids.held}`);
  await expect(page.locator('[data-slot="view-only-note"]')).toBeVisible();
  await expect(page.getByLabel("Role name")).toBeDisabled();
  for (const swtch of await switches(page).all()) await expect(swtch).toBeDisabled();
  await expect(page.locator('[data-slot="role-footer"]')).toHaveCount(0);
  expect((await page.goto("/en/admin/roles/new"))?.status()).toBe(403);
});

test("saving a Role you hold asks before removing your own access, and the page turns read-only after", async ({ page }) => {
  await selfEditor.signIn(page);
  await gotoHydrated(page, `/en/admin/roles/${ids.selfRole}`);
  await group(page, "roles").click();
  await sw(page, "Manage roles").click();
  await save(page).click();
  const dialog = page.getByRole("alertdialog", { name: "Remove your own access?" });
  await expect(dialog.locator('[data-slot="own-access-list"] li')).toHaveText(["Manage roles"]);
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await keysOf(ids.selfRole)).toContain("manage-roles"); // nothing was saved

  await save(page).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Save anyway" }).click();
  await expect(page.locator("[data-sonner-toast]").first()).toContainText("Role saved");
  expect(await keysOf(ids.selfRole)).not.toContain("manage-roles");
  await expect(page.locator('[data-slot="view-only-note"]')).toBeVisible();
  await expect(page.locator('[data-slot="role-footer"]')).toHaveCount(0);
});

for (const [prefix, dir, name, deleteLabel] of [
  ["", "rtl", "fa", "حذف نقش"],
  ["/en", "ltr", "en", "Delete role"],
] as const) {
  test(`axe and layout direction: the list, the editor, the Super role and a confirm, ${dir.toUpperCase()} (${name})`, async ({ page }) => {
    await superAdmin.signIn(page);
    await gotoHydrated(page, `${prefix}/admin/roles`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(rows(page).first()).toBeVisible();
    await expectNoAxeViolations(page);

    await gotoHydrated(page, `${prefix}/admin/roles/${ids.superRole}`);
    await expect(page.locator('[data-slot="super-note"]')).toBeVisible();
    await expectNoAxeViolations(page);

    await gotoHydrated(page, `${prefix}/admin/roles/${ids.spare}`);
    // The group navigation sits at the start side of the permission pane: right in RTL, left in LTR.
    const nav = (await page.locator('[data-slot="permission-groups"]').boundingBox())!;
    const pane = (await page.locator('[data-slot="permission-pane"]').boundingBox())!;
    expect(nav.x < pane.x).toBe(dir === "ltr");
    await expectNoAxeViolations(page);
    await group(page, "roles").click();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: deleteLabel }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");

    // On a phone the page does not scroll sideways and the groups are a row above the switches.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-slot="permission-groups"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page);
  });
}
