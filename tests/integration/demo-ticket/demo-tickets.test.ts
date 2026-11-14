// demo-ticket:start (whole file)
// @vitest-environment node
import { fileURLToPath } from "node:url";
import { fetch, setup } from "@nuxt/test-utils/e2e";
import { beforeAll, expect, it } from "vitest";
import { dbSuite, useTestDatabase } from "../support/database";
import { createDemoTicketRow } from "../support/demo-ticket-factory";

// The demo ticket API through the built server against a real throwaway database (.specs/demo-tickets/spec.md): the
// happy path, Zod rejection, 401 and 403 per key, the forward-only status rule, versions and the audit events.
dbSuite("Demo tickets API", async () => {
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
  const ZERO = "00000000-0000-4000-8000-000000000000";

  async function account(phone: string, permissions: string[], givenName: string | null = null) {
    const [user] = await q("INSERT INTO users (phone_e164, phone_verified_at, given_name, family_name) VALUES ($1, now(), $2, $3) RETURNING id", [phone, givenName, givenName ? "Tester" : null]);
    const [role] = await q("INSERT INTO roles (name) VALUES ($1) RETURNING id", [`held-${phone}`]);
    for (const key of permissions) await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)", [role.id, key]);
    await q("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [user.id, role.id]);
    await q("DELETE FROM otp_send_events"); // a sign-in right after another is not "too soon"
    const json = { "content-type": "application/json", origin: ORIGIN };
    const requested = await fetch("/api/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ phone, locale: "en" }), headers: json });
    const { testCode } = (await requested.json()) as { testCode: string };
    const verified = await fetch("/api/v1/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code: testCode }), headers: json });
    if (!verified.ok) throw new Error(`sign-in ${phone}: ${requested.status} ${verified.status} ${await verified.text()}`);
    return { id: user.id as string, cookie: (verified.headers.get("set-cookie") ?? "").split(";")[0]! };
  }

  const call = (cookie: string | null, method: string, path: string, body?: unknown) =>
    fetch(path, {
      method,
      redirect: "manual",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { origin: ORIGIN, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    });
  const codeOf = async (response: Response) => ((await response.json()) as { data?: { code?: string; fieldErrors?: Record<string, string[]> } }).data?.code;

  type Ticket = { id: string; title: string; status: string; priority: string; description: string | null; assignee: { id: string } | null; createdBy: { id: string } | null; updatedAt: string; statusSince: string };
  let manager: Awaited<ReturnType<typeof account>>;
  let viewer: Awaited<ReturnType<typeof account>>;
  let outsider: Awaited<ReturnType<typeof account>>;
  // Signing in is rate limited per address, so the accounts sign in once.
  beforeAll(async () => {
    await database.truncate();
    manager = await account("+989120000201", ["view-demo-tickets", "manage-demo-tickets"], "Mina");
    viewer = await account("+989120000202", ["view-demo-tickets"]);
    outsider = await account("+989120000203", ["view-users"]);
  });

  const routes = [
    { method: "GET", path: "/api/v1/admin/demo-tickets", needs: "view-demo-tickets" },
    { method: "GET", path: `/api/v1/admin/demo-tickets/${ZERO}`, needs: "view-demo-tickets" },
    { method: "GET", path: "/api/v1/admin/demo-tickets/assignees", needs: "view-demo-tickets" },
    { method: "POST", path: "/api/v1/admin/demo-tickets", needs: "manage-demo-tickets", body: { title: "A ticket" } },
    { method: "PATCH", path: `/api/v1/admin/demo-tickets/${ZERO}`, needs: "manage-demo-tickets", body: { title: "Renamed", expectedUpdatedAt: new Date().toISOString() } },
    { method: "DELETE", path: `/api/v1/admin/demo-tickets/${ZERO}`, needs: "manage-demo-tickets" },
  ];

  it("answers 401 without a session and 403 to a User missing the route's key, on every route", async () => {
    for (const route of routes) {
      const guest = await call(null, route.method, route.path, route.body);
      expect([route.path, guest.status, await codeOf(guest)]).toEqual([route.path, 401, "unauthenticated"]);
      const denied = await call(outsider.cookie, route.method, route.path, route.body);
      expect([route.path, denied.status, await codeOf(denied)]).toEqual([route.path, 403, "forbidden"]);
    }
    // `view-demo-tickets` alone reads but cannot write.
    for (const route of routes.filter((candidate) => candidate.needs === "manage-demo-tickets")) {
      expect((await call(viewer.cookie, route.method, route.path, route.body)).status, route.path).toBe(403);
    }
    expect((await call(viewer.cookie, "GET", "/api/v1/admin/demo-tickets")).status).toBe(200);
  });

  it("creates, lists with search and filters, reads, edits and deletes a ticket, and audits each change", async () => {
    const created = await call(manager.cookie, "POST", "/api/v1/admin/demo-tickets", { title: "  Printer is jammed  ", description: "Second floor", priority: "high", assigneeId: viewer.id });
    expect(created.status).toBe(201);
    const ticket = (await created.json()) as Ticket;
    expect(ticket).toMatchObject({ title: "Printer is jammed", description: "Second floor", status: "open", priority: "high", assignee: { id: viewer.id }, createdBy: { id: manager.id } });
    await createDemoTicketRow(database.db, manager.id, { title: "Coffee machine", createdAt: new Date(Date.now() - 60_000) });

    // Newest first, searched by title, filtered by status, priority and assignee.
    const list = async (query: string) => (await (await call(viewer.cookie, "GET", `/api/v1/admin/demo-tickets${query}`)).json()) as { total: number; page: number; pageSize: number; items: Ticket[] };
    expect((await list("")).items.map((item) => item.title)).toEqual(["Printer is jammed", "Coffee machine"]);
    expect((await list("?q=JAMMED")).items.map((item) => item.title)).toEqual(["Printer is jammed"]);
    expect(await list("?priority=high")).toMatchObject({ total: 1, pageSize: 20 });
    expect((await list(`?assignee=${viewer.id}`)).total).toBe(1);
    expect((await list("?assignee=none")).items.map((item) => item.title)).toEqual(["Coffee machine"]);
    expect((await list("?status=closed")).total).toBe(0);

    expect(((await (await call(viewer.cookie, "GET", `/api/v1/admin/demo-tickets/${ticket.id}`)).json()) as Ticket).title).toBe("Printer is jammed");
    const assignees = (await (await call(viewer.cookie, "GET", "/api/v1/admin/demo-tickets/assignees")).json()) as { items: { id: string; givenName: string | null }[] };
    expect(assignees.items.map((person) => person.id)).toContain(manager.id);

    // Edit fields and move one step forward in one save; the version moves.
    const edited = await call(manager.cookie, "PATCH", `/api/v1/admin/demo-tickets/${ticket.id}`, { title: "Printer is fixed", priority: "low", assigneeId: null, status: "in_progress", expectedUpdatedAt: ticket.updatedAt });
    expect(edited.status).toBe(200);
    const after = (await edited.json()) as Ticket;
    expect(after).toMatchObject({ title: "Printer is fixed", priority: "low", assignee: null, status: "in_progress" });
    expect(after.updatedAt).not.toBe(ticket.updatedAt);
    expect(new Date(after.statusSince).getTime()).toBeGreaterThanOrEqual(new Date(ticket.statusSince).getTime());

    // A save that changes nothing writes nothing and moves no version.
    const same = (await (await call(manager.cookie, "PATCH", `/api/v1/admin/demo-tickets/${ticket.id}`, { title: "Printer is fixed", expectedUpdatedAt: after.updatedAt })).json()) as Ticket;
    expect(same.updatedAt).toBe(after.updatedAt);

    expect((await call(manager.cookie, "DELETE", `/api/v1/admin/demo-tickets/${ticket.id}`)).status).toBe(204);
    expect((await call(viewer.cookie, "GET", `/api/v1/admin/demo-tickets/${ticket.id}`)).status).toBe(404);

    const events = await q("SELECT action, change_summary FROM admin_audit_events WHERE entity_id = $1 ORDER BY created_at, id", [ticket.id]);
    expect(events.map((event) => event.action)).toEqual(["demo_ticket.created", "demo_ticket.updated", "demo_ticket.status_changed", "demo_ticket.deleted"]);
    expect(events[1].change_summary).toEqual({ old: { title: "Printer is jammed", priority: "high", assignee: viewer.id }, new: { title: "Printer is fixed", priority: "low", assignee: null } });
    expect(events[2].change_summary).toEqual({ old: { status: "open" }, new: { status: "in_progress" } });
  });

  it("moves forward only, one step, and refuses a stale version", async () => {
    const id = await createDemoTicketRow(database.db, manager.id, { title: "Flow" });
    const version = async () => ((await (await call(manager.cookie, "GET", `/api/v1/admin/demo-tickets/${id}`)).json()) as Ticket).updatedAt;
    const move = async (status: string, expectedUpdatedAt: string) => call(manager.cookie, "PATCH", `/api/v1/admin/demo-tickets/${id}`, { status, expectedUpdatedAt });

    for (const skip of ["resolved", "closed"]) {
      const refused = await move(skip, await version());
      expect([refused.status, await codeOf(refused)]).toEqual([409, "invalid_transition"]);
    }
    const first = await version();
    expect((await move("in_progress", first)).status).toBe(200);
    // The old version is stale, and going back is refused.
    const stale = await move("resolved", first);
    expect([stale.status, await codeOf(stale)]).toEqual([409, "stale_version"]);
    const back = await move("open", await version());
    expect([back.status, await codeOf(back)]).toEqual([409, "invalid_transition"]);
    expect((await move("resolved", await version())).status).toBe(200);
    expect((await move("closed", await version())).status).toBe(200);
    const reopen = await move("open", await version());
    expect(await codeOf(reopen)).toBe("invalid_transition");
  });

  it("rejects invalid input at the boundary", async () => {
    const post = (body: unknown) => call(manager.cookie, "POST", "/api/v1/admin/demo-tickets", body);
    for (const body of [{}, { title: "   " }, { title: "x".repeat(201) }, { title: "ok", priority: "urgent" }, { title: "ok", status: "closed" }, { title: "ok", assigneeId: "not-a-uuid" }]) {
      const response = await post(body);
      expect([JSON.stringify(body).slice(0, 40), response.status, await codeOf(response)]).toEqual([JSON.stringify(body).slice(0, 40), 400, "validation_failed"]);
    }
    // An assignee must be an active account.
    const unknown = await post({ title: "ok", assigneeId: ZERO });
    expect([unknown.status, await codeOf(unknown)]).toEqual([400, "validation_failed"]);
    const [gone] = await q("INSERT INTO users (phone_e164, status) VALUES ('+989120000299', 'disabled') RETURNING id");
    expect((await post({ title: "ok", assigneeId: gone.id })).status).toBe(400);
    expect((await call(viewer.cookie, "GET", "/api/v1/admin/demo-tickets?status=bogus")).status).toBe(400);
    expect((await call(viewer.cookie, "GET", "/api/v1/admin/demo-tickets/not-a-uuid")).status).toBe(404);
  });
});
// demo-ticket:end
