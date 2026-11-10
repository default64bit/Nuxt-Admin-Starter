// demo-ticket:start (whole file)
import dotenv from "dotenv";
import pg from "pg";
import type { Page } from "@playwright/test";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { removeDemoTickets, seedDemoTickets, type SeededTicket } from "./support/demo-ticket-seed";
import { expect, test } from "./support/test";

// The Demo tickets Table view through the real server (.specs/demo-tickets/spec.md): search, the filters and paging in
// the URL, create / edit (one step forward) / delete behind a confirmation in one dialog, a `?ticket=<id>` link, the
// view-only state, and axe plus the layout direction in both locales.
dotenv.config({ quiet: true });
test.describe.configure({ mode: "serial" });

const TAG = `e2edt${Date.now()}`;
let manager: AdminAccount;
let viewer: AdminAccount;
let pool: pg.Pool;
let seeded: Awaited<ReturnType<typeof seedDemoTickets>>;
let managerId: string;

test.beforeAll(async () => {
  manager = await createAdminAccount("+989125550341", { permissions: ["view-demo-tickets", "manage-demo-tickets"], givenName: `${TAG}Mina` });
  viewer = await createAdminAccount("+989125550342", { permissions: ["view-demo-tickets"] });
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  managerId = String((await pool.query("SELECT id FROM users WHERE phone_e164 = '+989125550341'")).rows[0].id);
  seeded = await seedDemoTickets(pool, { tag: TAG, userId: managerId });
});
test.afterAll(async () => {
  await removeDemoTickets(pool, TAG);
  await pool?.end();
  for (const account of [manager, viewer]) await account?.cleanup();
});

const rows = (page: Page) => page.locator("tbody tr");
const row = (page: Page, text: string) => rows(page).filter({ hasText: text });
const dialog = (page: Page) => page.locator('[data-slot="demo-ticket-dialog"]');
const pick = async (page: Page, trigger: string, option: string) => {
  await page.getByRole("combobox", { name: trigger, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};
const open = async (page: Page, query = "") => gotoHydrated(page, `/en/admin/demo-tickets${query}`);

test("the list: newest first, 20 per page, search, filters and chips", async ({ page }) => {
  await manager.signIn(page);
  await open(page, `?q=${TAG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo tickets");
  await expect(page.getByRole("columnheader")).toHaveText(["Title", "Status", "Priority", "Assignee", "Created"]);
  await expect(rows(page)).toHaveCount(20);
  await expect(rows(page).first()).toContainText("closed job");
  await expect(rows(page).first().locator("[data-tone]")).toHaveAttribute("data-tone", "neutral");
  await expect(row(page, "progress job").locator("[data-tone]")).toHaveAttribute("data-tone", "progress");
  await expect(row(page, "progress job")).toContainText("Mina");
  await expect(row(page, "waiting job").locator("[data-tone]")).toHaveAttribute("data-tone", "info");
  await expect(row(page, "waiting job").locator('[data-slot="waiting-long"]')).toBeVisible();
  await expect(row(page, "progress job").locator('[data-slot="waiting-long"]')).toHaveCount(0);

  await page.locator('[data-slot="table-next"]').click();
  await expect(page).toHaveURL(/page=2/);
  await expect(rows(page)).toHaveCount(5);
  await page.locator('[data-slot="table-previous"]').click();
  await expect(rows(page)).toHaveCount(20);

  await page.getByRole("searchbox", { name: "Search demo tickets" }).fill(`${TAG} PROGRESS`);
  await expect(page).toHaveURL(/q=/);
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await page.getByRole("searchbox", { name: "Search demo tickets" }).fill(TAG);
  await expect(rows(page)).toHaveCount(20);

  await pick(page, "Status", "Closed");
  await expect(page).toHaveURL(/status=closed/);
  await expect(rows(page)).toHaveCount(1);
  await pick(page, "Status", "All statuses");
  await expect(rows(page)).toHaveCount(20);
  await pick(page, "Priority", "High");
  await expect(rows(page).first()).toContainText("progress job");
  await expect(rows(page)).toHaveCount(1);
  await pick(page, "Priority", "All priorities");
  await pick(page, "Assignee", "Unassigned");
  await expect(page).toHaveURL(/assignee=none/);
  await expect(rows(page)).toHaveCount(20);
  await pick(page, "Assignee", `${TAG}Mina`);
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page).not.toHaveURL(/assignee=/);
});

test("create, edit one step forward, and delete behind a confirmation", async ({ page }) => {
  await manager.signIn(page);
  await open(page, `?q=${TAG}`);
  const title = `${TAG} created by the spec`;

  await page.locator('[data-slot="new-demo-ticket"]').click();
  await expect(dialog(page).getByRole("heading", { name: "New demo ticket" })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Create ticket" }).click();
  await expect(dialog(page).getByText("This field is required.")).toBeVisible();
  await dialog(page).getByLabel("Title").fill(title);
  await dialog(page).getByLabel("Description").fill("Made by the e2e spec");
  await dialog(page).getByRole("button", { name: "Create ticket" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(rows(page).first()).toContainText(title); // newest first
  await expect(rows(page).first().locator("[data-tone]")).toHaveAttribute("data-tone", "info");

  // A row opens the same dialog as an edit; the status field offers only the next step.
  await row(page, title).getByRole("button", { name: title }).click();
  await expect(page).toHaveURL(/ticket=/);
  await expect(dialog(page).getByLabel("Title")).toHaveValue(title);
  await dialog(page).getByLabel("Title").fill(`${title} (edited)`);
  await page.getByRole("combobox", { name: "Status", exact: true }).last().click();
  await expect(page.getByRole("option")).toHaveText(["Open", "In progress"]);
  await page.getByRole("option", { name: "In progress", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Save changes" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/ticket=/);
  await expect(row(page, "(edited)").locator("[data-tone]")).toHaveAttribute("data-tone", "progress");

  // Delete asks first; keeping the ticket changes nothing.
  await row(page, "(edited)").getByRole("button", { name: `${title} (edited)` }).click();
  await dialog(page).locator('[data-slot="delete-demo-ticket"]').click();
  await expect(page.getByRole("alertdialog")).toContainText("deleted for good");
  await page.getByRole("button", { name: "Keep ticket" }).click();
  await expect(row(page, "(edited)")).toHaveCount(1);
  await dialog(page).locator('[data-slot="delete-demo-ticket"]').click();
  await page.locator('[data-slot="confirm-delete-demo-ticket"]').click();
  await expect(row(page, "(edited)")).toHaveCount(0);
  const { rows: left } = await pool.query("SELECT count(*)::int AS n FROM demo_tickets WHERE title LIKE $1", [`%${TAG} created%`]);
  expect(left[0].n).toBe(0);
});

test("a ?ticket link opens the ticket's dialog, and a viewer gets it read-only", async ({ page }) => {
  const target: SeededTicket = seeded.progress;
  await viewer.signIn(page);
  // The ticket is not on page 1 of this filtered list: the dialog still opens it.
  await open(page, `?status=closed&ticket=${target.id}`);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel("Title")).toHaveValue(target.title);
  await expect(dialog(page).getByLabel("Title")).toBeDisabled();
  await expect(dialog(page).getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await expect(dialog(page).locator('[data-slot="delete-demo-ticket"]')).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Close" }).first().click();
  await expect(page).not.toHaveURL(/ticket=/);
  await expect(page.locator('[data-slot="new-demo-ticket"]')).toHaveCount(0);

  // An unknown id says so instead of an empty dialog.
  await open(page, "?ticket=00000000-0000-4000-8000-000000000000");
  await expect(dialog(page).getByRole("alert")).toContainText("no longer exists");
});

for (const [prefix, dir, name] of [
  ["", "rtl", "fa"],
  ["/en", "ltr", "en"],
] as const) {
  test(`axe and layout direction: the list, a ticket dialog and the delete confirmation, ${dir.toUpperCase()} (${name})`, async ({ page }) => {
    await manager.signIn(page);
    await gotoHydrated(page, `${prefix}/admin/demo-tickets?q=${TAG}`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(rows(page).first()).toBeVisible();
    await expectNoAxeViolations(page);

    await gotoHydrated(page, `${prefix}/admin/demo-tickets?q=${TAG}&ticket=${seeded.waiting.id}`);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("textbox").first()).toHaveValue(seeded.waiting.title);
    await expectNoAxeViolations(page);
    await dialog(page).locator('[data-slot="delete-demo-ticket"]').click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");

    // On a phone the page does not scroll sideways.
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(rows(page).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
// demo-ticket:end
