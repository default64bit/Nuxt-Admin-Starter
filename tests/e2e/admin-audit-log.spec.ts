import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import { createAdminAccount, type AdminAccount } from "./support/admin-session";
import { expectNoAxeViolations } from "./support/axe";
import { gotoHydrated } from "./support/page";
import { expect, test } from "./support/test";

// The Audit log page (.specs/audit-log/spec.md): the feed shows seeded user and role events, the filters live in the
// URL, the Details panel shows before and after rows, and the page passes axe with the right direction in both
// locales. The API contract (append-only, emitted events, 401/403) is covered by the audit integration test.
dotenv.config({ quiet: true });
test.describe.configure({ mode: "serial" });

// Audit events are append-only, so every run seeds its own entities.
const ROLE_ID = randomUUID();
const USER_ID = randomUUID();
let auditor: AdminAccount;
let pool: pg.Pool;

test.beforeAll(async () => {
  auditor = await createAdminAccount("+989125550801", { permissions: ["view-audit-log"], givenName: "Audrey" });
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const [{ id: actor }] = (await pool.query("SELECT id FROM users WHERE phone_e164 = '+989125550801'")).rows as { id: string }[];
  await pool.query(
    `INSERT INTO admin_audit_events (actor_user_id, action, entity_type, entity_id, outcome, change_summary, correlation_id) VALUES
      ($1, 'user.disable', 'user', $2, 'success', '{"old":{"status":"active"},"new":{"status":"disabled"}}', 'e2e-audit-req-1'),
      ($1, 'role.create', 'role', $3, 'success', '{"name":"Support","permissions":["view-users"]}', 'e2e-audit-req-2')`,
    [actor, USER_ID, ROLE_ID],
  );
});
test.afterAll(async () => {
  await pool?.end();
  await auditor?.cleanup();
});

test("the feed shows events, filters by group and entity id from the URL, and opens before and after details", async ({ page }) => {
  await auditor.signIn(page);
  await gotoHydrated(page, "/en/admin/audit-log");
  const events = page.locator('[data-slot="audit-event"]');
  await expect(events.filter({ hasText: "User disabled" }).first()).toBeVisible();
  await expect(events.filter({ hasText: "Role created" }).first()).toBeVisible();

  // The group filter: pick it in the UI and the URL follows.
  await page.locator('[data-slot="audit-group"]').click();
  await page.getByRole("option", { name: "People" }).click();
  await expect(page).toHaveURL(/group=people/);
  await expect(events.filter({ hasText: "Signed in" })).toHaveCount(0);

  // Search by an exact entity id.
  await page.getByRole("searchbox", { name: "Search by entity ID or request ID" }).fill(USER_ID);
  await expect(page).toHaveURL(new RegExp(`q=${USER_ID}`));
  await expect(events).toHaveCount(1);

  await events.first().locator('[data-slot="details-toggle"]').click();
  await expect(page.locator('[data-slot="details-rows"] li').first()).toHaveText("Status: Active → Disabled");
  await expect(page.locator('[data-slot="detail-key"]')).toHaveText("user.disable");

  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page).not.toHaveURL(/q=/);
  await expect(events.filter({ hasText: "Role created" }).first()).toBeVisible();

  // No match shows the empty filter state.
  await gotoHydrated(page, "/en/admin/audit-log?q=no-such-id");
  await expect(page.locator('[data-slot="audit-empty"]')).toContainText("No events match these filters.");
});

for (const [prefix, dir, name] of [
  ["/en", "ltr", "English"],
  ["", "rtl", "Persian"],
] as const) {
  test(`axe and layout direction: the Audit log, ${dir.toUpperCase()} (${name})`, async ({ page }) => {
    await auditor.signIn(page);
    await gotoHydrated(page, `${prefix}/admin/audit-log`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.locator('[data-slot="audit-event"]').first()).toBeVisible();
    await expectNoAxeViolations(page);
    await page.locator('[data-slot="details-toggle"]').first().click();
    await expect(page.locator('[data-slot="details-content"]')).toBeVisible();
    await expectNoAxeViolations(page);
  });
}
