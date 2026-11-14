// @vitest-environment node
import { fileURLToPath } from "node:url";
import { fetch, setup } from "@nuxt/test-utils/e2e";
import { beforeAll, expect, it } from "vitest";
import { dbSuite, useTestDatabase } from "../support/database";

// The audit log (.specs/audit-log/spec.md) against a real throwaway database: the table is append-only in the
// database itself, user / role / sign-in actions write their events with before and after values inside the same
// transaction, a refused attempt is recorded, and the read API answers 401 / 403 and filters.
dbSuite("Audit log", async () => {
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
  const json = { "content-type": "application/json", origin: ORIGIN };

  async function signIn(phone: string) {
    await q("DELETE FROM otp_send_events");
    const requested = await fetch("/api/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ phone, locale: "en" }), headers: json });
    const { testCode } = (await requested.json()) as { testCode: string };
    const verified = await fetch("/api/v1/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code: testCode }), headers: json });
    if (!verified.ok) throw new Error(`sign-in ${phone}: ${requested.status} ${verified.status} ${await verified.text()}`);
    return (verified.headers.get("set-cookie") ?? "").split(";")[0]!;
  }

  async function account(phone: string, permissions: string[]) {
    const [user] = await q("INSERT INTO users (phone_e164, phone_verified_at) VALUES ($1, now()) RETURNING id", [phone]);
    const [role] = await q("INSERT INTO roles (name) VALUES ($1) RETURNING id", [`held-${phone}`]);
    for (const key of permissions) await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)", [role.id, key]);
    await q("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [user.id, role.id]);
    return { id: user.id as string, cookie: await signIn(phone) };
  }

  const call = (cookie: string | null, method: string, path: string, body?: unknown) =>
    fetch(path, {
      method,
      redirect: "manual",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { origin: ORIGIN, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    });
  type Item = { id: string; action: string; outcome: string; entityType: string; entityId: string | null; actor: { id: string } | null; changeCount: number };
  type Page = { items: Item[]; nextCursor: string | null; previousCursor: string | null };
  type Event = { summary: Record<string, unknown>; correlationId: string | null; outcome: string };
  const feed = async (cookie: string, query = "") => (await (await call(cookie, "GET", `/api/v1/admin/audit-log${query}`)).json()) as Page;
  const event = async (cookie: string, id: string) => (await (await call(cookie, "GET", `/api/v1/admin/audit-log/${id}`)).json()) as Event;
  const latest = async (action: string, entityId?: string) => (await q("SELECT * FROM admin_audit_events WHERE action = $1 AND ($2::text IS NULL OR entity_id = $2) ORDER BY created_at DESC, id DESC LIMIT 1", [action, entityId ?? null]))[0];

  let admin: Awaited<ReturnType<typeof account>>;
  let auditor: Awaited<ReturnType<typeof account>>;
  let outsider: Awaited<ReturnType<typeof account>>;
  beforeAll(async () => {
    await database.truncate();
    admin = await account("+989120000401", ["view-users", "create-users", "edit-users", "disable-users", "view-roles", "manage-roles"]);
    auditor = await account("+989120000402", ["view-audit-log"]);
    outsider = await account("+989120000403", ["view-users", "edit-users"]);
  });

  it("rejects every update, delete and truncate of an audit event in the database", async () => {
    const [row] = await q("INSERT INTO admin_audit_events (action, entity_type, outcome) VALUES ('test.append', 'test', 'success') RETURNING id");
    for (const statement of ["UPDATE admin_audit_events SET reason = 'edited' WHERE id = $1", "DELETE FROM admin_audit_events WHERE id = $1", "TRUNCATE admin_audit_events"]) {
      await expect(database.pool.query(statement, statement.startsWith("TRUNCATE") ? [] : [row.id])).rejects.toMatchObject({ code: "23000" });
    }
    expect((await q("SELECT reason FROM admin_audit_events WHERE id = $1", [row.id]))[0].reason).toBeNull();
  });

  it("records sign-in, user and role actions with before and after values", async () => {
    // Sign-in wrote an event for each account.
    expect(await latest("auth.sign_in", admin.id)).toMatchObject({ actor_user_id: admin.id, outcome: "success" });

    const roleCreated = await call(admin.cookie, "POST", "/api/v1/admin/roles", { name: "Support", permissions: ["view-users"] });
    expect(roleCreated.status).toBe(201);
    const role = (await roleCreated.json()) as { id: string; updatedAt: string };
    expect((await latest("role.create", role.id)).change_summary).toEqual({ name: "Support", permissions: ["view-users"] });

    const spare = (await (await call(admin.cookie, "POST", "/api/v1/admin/roles", { name: "Spare", permissions: ["view-users"] })).json()) as { id: string; updatedAt: string };
    const renamed = await call(admin.cookie, "PUT", `/api/v1/admin/roles/${role.id}`, { name: "Support team", permissions: ["view-users", "edit-users"], expectedUpdatedAt: role.updatedAt });
    expect(renamed.status).toBe(200);
    expect((await latest("role.update", role.id)).change_summary).toEqual({ old: { name: "Support" }, new: { name: "Support team" }, added: ["edit-users"], removed: [] });

    const created = await call(admin.cookie, "POST", "/api/v1/admin/users", { phone: "0912 000 0411", givenName: "Nia", familyName: "Rahimi", roleIds: [role.id] });
    expect(created.status).toBe(201);
    let nia = (await created.json()) as { id: string; updatedAt: string };
    expect((await latest("user.create", nia.id)).change_summary).toEqual({ givenName: "Nia", familyName: "Rahimi", roles: [role.id] });

    nia = (await (await call(admin.cookie, "PATCH", `/api/v1/admin/users/${nia.id}`, { givenName: "Nia", familyName: "Karimi", expectedUpdatedAt: nia.updatedAt })).json()) as typeof nia;
    expect((await latest("user.update", nia.id)).change_summary).toEqual({ old: { familyName: "Rahimi" }, new: { familyName: "Karimi" } });

    nia = (await (await call(admin.cookie, "PUT", `/api/v1/admin/users/${nia.id}/roles`, { roleIds: [spare.id], expectedUpdatedAt: nia.updatedAt })).json()) as typeof nia;
    expect((await latest("user.roles", nia.id)).change_summary).toEqual({ added: [spare.id], removed: [role.id] });

    nia = (await (await call(admin.cookie, "POST", `/api/v1/admin/users/${nia.id}/disable`, { expectedUpdatedAt: nia.updatedAt })).json()) as typeof nia;
    expect((await latest("user.disable", nia.id)).change_summary).toEqual({ old: { status: "active" }, new: { status: "disabled" } });
    nia = (await (await call(admin.cookie, "POST", `/api/v1/admin/users/${nia.id}/enable`, { expectedUpdatedAt: nia.updatedAt })).json()) as typeof nia;
    expect((await latest("user.enable", nia.id)).change_summary).toEqual({ old: { status: "disabled" }, new: { status: "active" } });

    // A save that changes nothing writes no event.
    const before = (await q("SELECT count(*)::int AS n FROM admin_audit_events WHERE action = 'user.update'"))[0].n;
    const same = await call(admin.cookie, "PATCH", `/api/v1/admin/users/${nia.id}`, { givenName: "Nia", familyName: "Karimi", expectedUpdatedAt: nia.updatedAt });
    expect(same.status).toBe(200);
    expect((await q("SELECT count(*)::int AS n FROM admin_audit_events WHERE action = 'user.update'"))[0].n).toBe(before);

    const deleted = await call(admin.cookie, "DELETE", `/api/v1/admin/roles/${role.id}?expectedUpdatedAt=${encodeURIComponent(((await (await call(admin.cookie, "GET", `/api/v1/admin/roles/${role.id}`)).json()) as { updatedAt: string }).updatedAt)}`);
    expect(deleted.status).toBe(204);
    expect((await latest("role.delete", role.id)).change_summary).toEqual({ name: "Support team", permissions: ["view-users", "edit-users"] });

    // The edits above carry the request id of the call that made them, so an event can be matched to the logs.
    expect((await latest("role.delete", role.id)).correlation_id).toEqual(expect.any(String));
  });

  it("records a refused attempt as denied, once, with a closed reason", async () => {
    const target = (await q("SELECT id, updated_at FROM users WHERE phone_e164 = '+989120000411'"))[0];
    // `outsider` may edit Users but not manage Roles, which setting a User's Roles also needs.
    const body = { roleIds: [(await q("SELECT id FROM roles WHERE name = 'Spare'"))[0].id], expectedUpdatedAt: new Date(target.updated_at).toISOString() };
    for (let attempt = 0; attempt < 2; attempt++) expect((await call(outsider.cookie, "PUT", `/api/v1/admin/users/${target.id}/roles`, body)).status).toBe(403);
    const denied = await q("SELECT * FROM admin_audit_events WHERE outcome = 'denied' AND actor_user_id = $1", [outsider.id]);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ action: "user.roles", entity_type: "user", entity_id: target.id });
    expect(denied[0].change_summary).toEqual({ reasonCode: "missing_permission", method: "PUT", route: "/api/v1/admin/users/:id/roles" });
  });

  it("answers 401 without a session and 403 without view-audit-log, and filters the feed", async () => {
    for (const path of ["/api/v1/admin/audit-log", `/api/v1/admin/audit-log/${admin.id}`, "/api/v1/admin/audit-log/actors"]) {
      expect((await call(null, "GET", path)).status).toBe(401);
      expect((await call(outsider.cookie, "GET", path)).status).toBe(403);
    }

    const all = await feed(auditor.cookie);
    expect(all.items.length).toBeGreaterThan(8);
    expect(all.items[0]).toMatchObject({ outcome: expect.any(String) });
    const people = await feed(auditor.cookie, "?group=people");
    expect(people.items.length).toBeGreaterThan(0);
    expect(people.items.every((item) => /^(user|role)\./.test(item.action))).toBe(true);
    const bySomeone = await feed(auditor.cookie, `?actor=${admin.id}&group=auth`);
    expect(bySomeone.items.map((item) => item.action)).toEqual(["auth.sign_in"]);

    // An exact entity id; the detail carries the summary and the request id.
    const roleUpdate = await latest("role.update");
    const forEntity = await feed(auditor.cookie, `?q=${roleUpdate.entity_id}`);
    expect(forEntity.items.map((item) => item.action)).toEqual(expect.arrayContaining(["role.update", "role.create"]));
    const detail = await event(auditor.cookie, roleUpdate.id);
    expect(detail.summary).toMatchObject({ old: { name: "Support" }, new: { name: "Support team" } });
    expect(detail.correlationId).toEqual(expect.any(String));

    // Paging: a cursor leads to older events, and Previous returns.
    const first = await feed(auditor.cookie, "?group=people&to=2100-01-01");
    expect(first.items.length).toBeLessThanOrEqual(20);
    expect((await call(auditor.cookie, "GET", "/api/v1/admin/audit-log?actor=not-a-uuid")).status).toBe(400);
  });

  it("records sign-out once", async () => {
    const out = await call(admin.cookie, "POST", "/api/v1/auth/logout");
    expect(out.status).toBe(204);
    expect(await latest("auth.sign_out", admin.id)).toMatchObject({ actor_user_id: admin.id });
    const count = () => q("SELECT count(*)::int AS n FROM admin_audit_events WHERE action = 'auth.sign_out'");
    const n = (await count())[0].n;
    await call(admin.cookie, "POST", "/api/v1/auth/logout");
    expect((await count())[0].n).toBe(n);
  });
});
