// demo-ticket:start (whole file)
// @vitest-environment node
import { fileURLToPath } from "node:url";
import { fetch, setup } from "@nuxt/test-utils/e2e";
import { beforeAll, expect, it } from "vitest";
import { dbSuite, useTestDatabase } from "../support/database";
import { createDemoTicketRow } from "../support/demo-ticket-factory";

// The "Demo ticket assigned to you" Notification and the Inbox through the built server against a real database:
// raised for another assignee only, one item per assignment, closed in the same transaction when the work ends,
// visible only to its recipient while they hold the gating key (read time), and the nav counts.
dbSuite("Demo ticket Notifications", async () => {
  const database = useTestDatabase();
  const ORIGIN = "http://localhost:3000";

  await setup({
    rootDir: fileURLToPath(new URL("../../..", import.meta.url)),
    server: true,
    setupTimeout: 240_000,
    nuxtConfig: {
      runtimeConfig: {
        appEnv: "test",
        databaseUrl: database.url,
        session: { password: "test-session-password-0123456789abcdef" },
        ipHashSecret: "test-ip-hash-secret-0123456789abcdef",
        public: { siteUrl: ORIGIN },
      },
    },
  });

  const q = async (sql: string, params: unknown[] = []) => (await database.pool.query(sql, params)).rows;

  async function account(phone: string, permissions: string[]) {
    const [user] = await q("INSERT INTO users (phone_e164, phone_verified_at) VALUES ($1, now()) RETURNING id", [phone]);
    const [role] = await q("INSERT INTO roles (name) VALUES ($1) RETURNING id", [`held-${phone}`]);
    for (const key of permissions) await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)", [role.id, key]);
    await q("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [user.id, role.id]);
    await q("DELETE FROM otp_send_events");
    const json = { "content-type": "application/json", origin: ORIGIN };
    const requested = await fetch("/api/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ phone, locale: "en" }), headers: json });
    const { testCode } = (await requested.json()) as { testCode: string };
    const verified = await fetch("/api/v1/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code: testCode }), headers: json });
    if (!verified.ok) throw new Error(`sign-in ${phone}: ${verified.status}`);
    return { id: user.id as string, roleId: role.id as string, cookie: (verified.headers.get("set-cookie") ?? "").split(";")[0]! };
  }

  const call = (cookie: string | null, method: string, path: string, body?: unknown) =>
    fetch(path, {
      method,
      redirect: "manual",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { origin: ORIGIN, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    });
  type Item = { id: string; type: string; tokens: string[]; link: string; resolvedAt: string | null; read: boolean };
  const inbox = async (cookie: string, tab = "all") => (await (await call(cookie, "GET", `/api/v1/admin/notifications?tab=${tab}`)).json()) as { items: Item[]; total: number };
  const counts = async (cookie: string) => (await (await call(cookie, "GET", "/api/v1/admin/nav-counts")).json()) as { inboxUnread: number; newest: { id: string } | null; openDemoTickets?: number };
  type Ticket = { id: string; updatedAt: string };
  const patch = async (ticket: Ticket, body: Record<string, unknown>) => (await (await call(manager.cookie, "PATCH", `/api/v1/admin/demo-tickets/${ticket.id}`, { ...body, expectedUpdatedAt: ticket.updatedAt })).json()) as Ticket;
  const get = async (id: string) => (await (await call(manager.cookie, "GET", `/api/v1/admin/demo-tickets/${id}`)).json()) as Ticket;

  let manager: Awaited<ReturnType<typeof account>>;
  let alice: Awaited<ReturnType<typeof account>>;
  let bob: Awaited<ReturnType<typeof account>>;
  let outsider: Awaited<ReturnType<typeof account>>;
  beforeAll(async () => {
    await database.truncate();
    manager = await account("+989120000301", ["view-demo-tickets", "manage-demo-tickets"]);
    alice = await account("+989120000302", ["view-demo-tickets"]);
    bob = await account("+989120000303", ["view-demo-tickets"]);
    outsider = await account("+989120000304", ["view-users"]);
  });

  it("raises one item per assignment for the new assignee only, never on self-assign, and closes it with the work", async () => {
    const id = await createDemoTicketRow(database.db, manager.id, { title: "Assign me", priority: "high" });

    // Self-assign raises nothing.
    let ticket = await patch(await get(id), { assigneeId: manager.id });
    expect((await q("SELECT 1 FROM notifications")).length).toBe(0);

    // Assigning Alice: her Inbox has one open, unread item with the link and the priority token; nobody else sees it.
    ticket = await patch(ticket, { assigneeId: alice.id });
    const [item] = (await inbox(alice.cookie)).items;
    expect(item).toMatchObject({ type: "demo_ticket.assigned", tokens: ["high"], link: `/admin/demo-tickets?ticket=${id}`, resolvedAt: null, read: false });
    expect((await inbox(bob.cookie)).total).toBe(0);
    expect((await inbox(manager.cookie)).total).toBe(0);
    expect(await counts(alice.cookie)).toMatchObject({ inboxUnread: 1, newest: { id: item!.id }, openDemoTickets: 1 });
    expect(Object.keys(await counts(outsider.cookie)).sort()).toEqual(["inboxUnread", "newest"]);

    // A save that changes nothing records nothing more. Reading is per User.
    await patch(ticket, { title: "Assign me" });
    expect((await q("SELECT 1 FROM notifications")).length).toBe(1);
    expect((await call(bob.cookie, "POST", `/api/v1/admin/notifications/${item!.id}/read`)).status).toBe(404);
    expect((await call(alice.cookie, "POST", `/api/v1/admin/notifications/${item!.id}/read`)).status).toBe(200);
    expect((await counts(alice.cookie)).inboxUnread).toBe(0);

    // Reassigning closes Alice's item in the same save and raises Bob's; assigning Alice again is a new item.
    await patch(ticket, { assigneeId: bob.id });
    expect((await inbox(alice.cookie)).items[0]).toMatchObject({ resolvedAt: expect.any(String) });
    expect((await inbox(bob.cookie, "unread")).total).toBe(1);
    await patch(await get(id), { assigneeId: alice.id });
    const all = (await inbox(alice.cookie)).items;
    expect(all.map((entry) => entry.resolvedAt === null)).toEqual([true, false]);

    // Resolving closes the open item; deleting closes it too.
    await patch(await get(id), { status: "in_progress" });
    expect((await inbox(alice.cookie, "open")).total).toBe(1);
    await patch(await get(id), { status: "resolved" });
    expect((await inbox(alice.cookie, "open")).total).toBe(0);
    const other = await createDemoTicketRow(database.db, manager.id, { title: "Delete me" });
    await patch(await get(other), { assigneeId: bob.id });
    expect((await inbox(bob.cookie, "open")).total).toBe(1);
    expect((await call(manager.cookie, "DELETE", `/api/v1/admin/demo-tickets/${other}`)).status).toBe(204);
    expect((await inbox(bob.cookie, "open")).total).toBe(0);
  });

  it("checks the gating key at read time", async () => {
    const id = await createDemoTicketRow(database.db, manager.id, { title: "Gate" });
    await patch(await get(id), { assigneeId: bob.id });
    const before = await inbox(bob.cookie, "open");
    expect(before.total).toBeGreaterThan(0);

    // Losing the key hides the item at once; getting it back shows it again.
    await q("DELETE FROM role_permissions WHERE role_id = $1 AND permission_key = 'view-demo-tickets'", [bob.roleId]);
    expect((await inbox(bob.cookie, "open")).total).toBe(0);
    expect((await counts(bob.cookie)).inboxUnread).toBe(0);
    await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, 'view-demo-tickets')", [bob.roleId]);
    expect((await inbox(bob.cookie, "open")).total).toBe(before.total);
  });

  it("saves the Message language and defaults it to fa", async () => {
    const settings = async (cookie: string) => (await (await call(cookie, "GET", "/api/v1/admin/account/notification-settings")).json()) as { locale: string; channels: unknown[] };
    expect(await settings(alice.cookie)).toMatchObject({ locale: "fa", channels: [{ key: "push", availability: "not_configured", enabled: true }] });
    expect((await call(alice.cookie, "PUT", "/api/v1/admin/account/notification-settings", { locale: "en" })).status).toBe(200);
    expect((await settings(alice.cookie)).locale).toBe("en");
    expect((await settings(bob.cookie)).locale).toBe("fa");
    expect((await call(alice.cookie, "PUT", "/api/v1/admin/account/notification-settings", { locale: "de" })).status).toBe(400);
    expect((await call(null, "GET", "/api/v1/admin/account/notification-settings")).status).toBe(401);
  });
});
// demo-ticket:end
