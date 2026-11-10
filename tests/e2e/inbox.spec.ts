// demo-ticket:start (whole file)
import dotenv from "dotenv";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { expect, test } from "./support/test";

// The Inbox through the real server with the "Demo ticket assigned to you" Notification: an assignment shows up on the
// bell and the Demo tickets badge (live, by the poll), opens its ticket from the Inbox, the Message language saves, and
// axe plus the layout direction hold in both locales.
dotenv.config({ quiet: true });
test.describe.configure({ mode: "serial" });

const TAG = `e2einbox${randomUUID().slice(0, 8)}`;
let manager: AdminAccount;
let assignee: AdminAccount;
let pool: pg.Pool;
let assigneeId: string;
let ticketId: string;

test.beforeAll(async () => {
  manager = await createAdminAccount("+989125550351", { permissions: ["view-demo-tickets", "manage-demo-tickets"] });
  assignee = await createAdminAccount("+989125550352", { permissions: ["view-demo-tickets"], givenName: `${TAG}Sara` });
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const users = await pool.query("SELECT id, phone_e164 FROM users WHERE phone_e164 IN ('+989125550351', '+989125550352')");
  const managerId = String(users.rows.find((row) => row.phone_e164 === "+989125550351").id);
  assigneeId = String(users.rows.find((row) => row.phone_e164 === "+989125550352").id);
  const ticket = await pool.query("INSERT INTO demo_tickets (title, priority, created_by) VALUES ($1, 'high', $2) RETURNING id", [`${TAG} ticket`, managerId]);
  ticketId = String(ticket.rows[0].id);
});
test.afterAll(async () => {
  await pool?.query("DELETE FROM notifications WHERE source_entity_id = $1", [ticketId]).catch(() => undefined);
  await pool?.query("DELETE FROM demo_tickets WHERE title LIKE $1", [`${TAG}%`]);
  await pool?.end();
  for (const account of [manager, assignee]) await account?.cleanup();
});

test("an assignment reaches the bell and the badge, opens its ticket, and the Message language saves", async ({ page, browser }) => {
  await assignee.signIn(page);
  await gotoHydrated(page, "/en/admin");
  await expect(page.locator('[data-slot="inbox-badge"]')).toHaveCount(0);

  // Someone else assigns the ticket (a second session, through the real API).
  const other = await browser.newPage();
  await manager.signIn(other);
  const version = await pool.query("SELECT updated_at FROM demo_tickets WHERE id = $1", [ticketId]);
  const assigned = await other.evaluate(
    async ([id, user, at]) => (await fetch(`/api/v1/admin/demo-tickets/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigneeId: user, expectedUpdatedAt: at }) })).status,
    [ticketId, assigneeId, new Date(version.rows[0].updated_at).toISOString()] as const,
  );
  expect(assigned).toBe(200);
  await other.close();

  // The nav-counts poll (20 s) finds it: the bell shows one unread and the Demo tickets item carries a badge.
  await expect(page.locator('[data-slot="inbox-badge"]').first()).toHaveText("1", { timeout: 40_000 });
  await expect(page.locator('[data-slot="nav-badge"][data-count-key="openDemoTickets"]')).toHaveText("1");

  await gotoHydrated(page, "/en/admin/notifications");
  const item = page.locator('[data-slot="inbox-item"]').first();
  await expect(item).toContainText("A demo ticket with high priority was assigned to you.");
  await item.locator("a").first().click();
  await expect(page).toHaveURL(new RegExp(`/en/admin/demo-tickets\\?ticket=${ticketId}`));
  await expect(page.locator('[data-slot="demo-ticket-dialog"]')).toBeVisible();

  // Opening it marked it read; the Message language is saved on the settings page.
  await gotoHydrated(page, "/en/admin/account/notifications");
  await expect(page.locator('[data-slot="message-language-select"]')).toContainText("فارسی");
  await page.locator('[data-slot="message-language-select"]').click();
  await page.getByRole("option", { name: "English" }).click();
  await page.locator('[data-slot="notification-settings-save"]').click();
  await expect(page.getByText("Notification settings saved.")).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-slot="message-language-select"]')).toContainText("English");
});

for (const [prefix, dir, name] of [
  ["", "rtl", "fa"],
  ["/en", "ltr", "en"],
] as const) {
  test(`axe and layout direction: the Inbox, the bell and the settings, ${dir.toUpperCase()} (${name})`, async ({ page }) => {
    await assignee.signIn(page);
    await gotoHydrated(page, `${prefix}/admin/notifications?tab=all`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.locator('[data-slot="inbox-item"]').first()).toBeVisible();
    await expectNoAxeViolations(page);

    await gotoHydrated(page, `${prefix}/admin/account/notifications`);
    await expect(page.locator('[data-slot="message-language"]')).toBeVisible();
    await expectNoAxeViolations(page);

    await page.locator('[data-slot="inbox-bell-button"]').click();
    await expect(page.locator('[data-slot="inbox-popover"]')).toBeVisible();
    await expectNoAxeViolations(page);
  });
}
// demo-ticket:end
