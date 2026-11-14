// demo-ticket:start (whole file)
import dotenv from "dotenv";
import pg from "pg";
import type { Page } from "@playwright/test";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { removeDemoTickets, seedDemoTickets } from "./support/demo-ticket-seed";
import { expect, test } from "./support/test";

// The Demo tickets Cards and Board views through the real server (.specs/demo-tickets/spec.md): the switch leaves
// the list and the URL alone, a Board move by button (one status forward, announced, stored), "Show more", the
// read-only Board, and axe plus the layout direction of both views in both locales.
dotenv.config({ quiet: true });
test.describe.configure({ mode: "serial" });

const TAG = `e2edv${Date.now()}`;
let manager: AdminAccount;
let viewer: AdminAccount;
let pool: pg.Pool;
let seeded: Awaited<ReturnType<typeof seedDemoTickets>>;

test.beforeAll(async () => {
  manager = await createAdminAccount("+989125550351", { permissions: ["view-demo-tickets", "manage-demo-tickets"], givenName: `${TAG}Mina` });
  viewer = await createAdminAccount("+989125550352", { permissions: ["view-demo-tickets"] });
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const managerId = String((await pool.query("SELECT id FROM users WHERE phone_e164 = '+989125550351'")).rows[0].id);
  seeded = await seedDemoTickets(pool, { tag: TAG, userId: managerId });
});
test.afterAll(async () => {
  await removeDemoTickets(pool, TAG);
  await pool?.end();
  for (const account of [manager, viewer]) await account?.cleanup();
});

const column = (page: Page, status: string) => page.locator(`[data-slot="board-column"][data-column="${status}"]`);
const cardOf = (page: Page, id: string) => page.locator(`[data-slot="board-card"][data-card-id="${id}"]`);
const statusOf = async (id: string) => String((await pool.query("SELECT status FROM demo_tickets WHERE id = $1", [id])).rows[0].status);
const switchTo = async (page: Page, view: "Table" | "Cards" | "Board") => page.locator('[data-slot="view-switch"]').getByRole("button", { name: view }).click();
const open = async (page: Page, prefix = "") => gotoHydrated(page, `${prefix}/admin/demo-tickets?q=${TAG}`);

test("Cards list the same page as the Table without touching the URL", async ({ page }) => {
  await manager.signIn(page);
  await open(page, "/en");
  await expect(page.locator("tbody tr")).toHaveCount(20);
  const url = page.url();

  await switchTo(page, "Cards");
  const cards = page.locator('[data-slot="row-card"]');
  await expect(cards).toHaveCount(20);
  expect(page.url()).toBe(url);
  await expect(cards.first()).toContainText("closed job");
  await expect(cards.first().locator("[data-tone]")).toHaveAttribute("data-tone", "neutral");
  await expect(cards.first()).toContainText("Assignee");

  await page.locator('[data-slot="table-next"]').click();
  await expect(page).toHaveURL(/page=2/);
  await expect(cards).toHaveCount(5);
  await page.locator('[data-slot="table-previous"]').click();

  await cards.first().getByRole("button", { name: /Open / }).click();
  await expect(page.locator('[data-slot="demo-ticket-dialog"]')).toBeVisible();
  await page.keyboard.press("Escape");

  await switchTo(page, "Table");
  await expect(page.locator("tbody tr")).toHaveCount(20);
});

test("the Board moves a ticket one status forward by its button, announced and stored", async ({ page }) => {
  await manager.signIn(page);
  await open(page, "/en");
  await switchTo(page, "Board");
  expect(await page.locator('[data-slot="board-column"]').evaluateAll((columns) => columns.map((element) => element.getAttribute("data-column")))).toEqual(["open", "in_progress", "resolved", "closed"]);
  await expect(column(page, "open").locator('[data-slot="board-column-count"]')).toHaveText("23");
  await expect(column(page, "in_progress").locator('[data-slot="board-column-count"]')).toHaveText("1");
  await expect(column(page, "resolved").locator('[data-slot="board-column-count"]')).toHaveText("0");

  // A column shows 20 tickets, then "Show more" loads the rest.
  await expect(column(page, "open").locator('[data-slot="board-card"]')).toHaveCount(20);
  await column(page, "open").locator('[data-slot="board-show-more"]').click();
  await expect(column(page, "open").locator('[data-slot="board-card"]')).toHaveCount(23);

  // Closed is the end: no move button. Moving "progress job" goes to Resolved, one step.
  await expect(column(page, "closed").locator('[data-slot="board-move"]')).toHaveCount(0);
  await cardOf(page, seeded.progress.id).locator('[data-slot="board-move"]').click();
  await expect(column(page, "resolved").locator(`[data-card-id="${seeded.progress.id}"]`)).toBeVisible();
  await expect(page.locator("body > [role=status]")).toContainText(`${seeded.progress.title}” moved to Resolved`);
  expect(await statusOf(seeded.progress.id)).toBe("resolved");
  await expect(column(page, "resolved").locator('[data-slot="board-column-count"]')).toHaveText("1");
});

test("a Board without the manage Permission is read-only", async ({ page }) => {
  await viewer.signIn(page);
  await open(page, "/en");
  await switchTo(page, "Board");
  await expect(column(page, "open").locator('[data-slot="board-card"]').first()).toBeVisible();
  await expect(page.locator("[data-drag-handle]")).toHaveCount(0);
  await expect(page.locator('[data-slot="board-move"]')).toHaveCount(0);
  await expect(page.getByText("You can follow the tickets but not move them.")).toBeVisible();
});

for (const [prefix, dir, name] of [
  ["", "rtl", "fa"],
  ["/en", "ltr", "en"],
] as const) {
  test(`axe and layout direction: Cards and Board, ${dir.toUpperCase()} (${name})`, async ({ page }) => {
    await manager.signIn(page);
    await open(page, prefix);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await page.locator('[data-slot="view-switch"] button').nth(1).click();
    await expect(page.locator('[data-slot="row-card"]').first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.locator('[data-slot="view-switch"] button').nth(2).click();
    await expect(column(page, "open").locator('[data-slot="board-card"]').first()).toBeVisible();
    await expectNoAxeViolations(page);
    // The first column starts at the reading side: right in RTL, left in LTR.
    const first = (await column(page, "open").boundingBox())!;
    const second = (await column(page, "in_progress").boundingBox())!;
    expect(dir === "rtl" ? first.x > second.x : first.x < second.x).toBe(true);

    // On a phone the page does not scroll sideways: the columns are a carousel.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
// demo-ticket:end
