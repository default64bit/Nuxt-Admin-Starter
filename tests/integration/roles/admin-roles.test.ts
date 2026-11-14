// @vitest-environment node
import { fileURLToPath } from "node:url";
import { fetch, setup } from "@nuxt/test-utils/e2e";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { PERMISSION_KEYS } from "../../../shared/constants/permissions";
import { dbSuite, useTestDatabase } from "../support/database";

// The Roles API through the built server against a real throwaway database (.specs/users-and-roles/spec.md): the
// happy path, Zod rejection, 401 and 403 per missing key, the Permission prerequisites and the Super role's protection.
dbSuite("Roles API", async () => {
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

  // An active account holding one Role with exactly these Permissions (or the seeded `super` Role), signed in.
  async function account(phone: string, permissions: string[] | "super") {
    const [user] = await q("INSERT INTO users (phone_e164, phone_verified_at) VALUES ($1, now()) RETURNING id", [phone]);
    if (permissions === "super") await q("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE is_super", [user.id]);
    else {
      const [role] = await q("INSERT INTO roles (name) VALUES ($1) RETURNING id", [`held-${phone}`]);
      for (const key of permissions) await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)", [role.id, key]);
      await q("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [user.id, role.id]);
    }
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
  const codeOf = async (response: Response) => ((await response.json()) as { data?: { code?: string } }).data?.code;

  let manager: Awaited<ReturnType<typeof account>>;
  let viewer: Awaited<ReturnType<typeof account>>;
  let auditor: Awaited<ReturnType<typeof account>>;
  let owner: Awaited<ReturnType<typeof account>>;
  // Signing in is rate limited per address, so the four accounts sign in once; each test starts from the same Roles.
  beforeAll(async () => {
    await database.truncate();
    manager = await account("+989120000101", ["view-roles", "manage-roles"]);
    viewer = await account("+989120000102", ["view-roles"]);
    auditor = await account("+989120000103", ["view-audit-log"]);
    owner = await account("+989120000104", "super");
  });
  beforeEach(async () => {
    await q("DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE NOT is_super AND name NOT LIKE 'held-%')");
    await q("DELETE FROM roles WHERE NOT is_super AND name NOT LIKE 'held-%'");
  });

  // Every route with the key that guards it.
  const routes = [
    { method: "GET", path: "/api/v1/admin/roles", needs: "view-roles" },
    { method: "GET", path: `/api/v1/admin/roles/${ZERO}`, needs: "view-roles" },
    { method: "POST", path: "/api/v1/admin/roles", needs: "manage-roles", body: { name: "Support", permissions: [] } },
    { method: "PUT", path: `/api/v1/admin/roles/${ZERO}`, needs: "manage-roles", body: { name: "Support", permissions: [], expectedUpdatedAt: new Date().toISOString() } },
    { method: "DELETE", path: `/api/v1/admin/roles/${ZERO}?expectedUpdatedAt=${encodeURIComponent(new Date().toISOString())}`, needs: "manage-roles" },
    { method: "GET", path: "/api/v1/admin/options/roles", needs: "view-users or view-roles" },
  ];

  it("answers 401 without a session and 403 to a User missing the route's key, on every route", async () => {
    for (const route of routes) {
      const guest = await call(null, route.method, route.path, route.body);
      expect([route.path, guest.status, await codeOf(guest)]).toEqual([route.path, 401, "unauthenticated"]);
      const denied = await call(auditor.cookie, route.method, route.path, route.body);
      expect([route.path, denied.status, await codeOf(denied)]).toEqual([route.path, 403, "forbidden"]);
    }
    // `view-roles` alone reads but cannot write.
    for (const route of routes.filter((candidate) => candidate.needs === "manage-roles")) {
      expect((await call(viewer.cookie, route.method, route.path, route.body)).status, route.path).toBe(403);
    }
    expect((await call(viewer.cookie, "GET", "/api/v1/admin/roles")).status).toBe(200);
  });

  it("creates, lists, reads, edits and deletes a Role, and lists the options", async () => {
    const created = await call(manager.cookie, "POST", "/api/v1/admin/roles", { name: "  Support  ", permissions: ["view-users", "edit-users"] });
    expect(created.status).toBe(201);
    const role = (await created.json()) as { id: string; name: string; permissions: string[]; updatedAt: string; memberCount: number };
    expect(role).toMatchObject({ name: "Support", permissions: ["view-users", "edit-users"], memberCount: 0 });

    // The list: `super` first, then by name; counts and search.
    const list = (await (await call(viewer.cookie, "GET", "/api/v1/admin/roles")).json()) as { total: number; items: { name: string; isSuper: boolean; permissionCount: number; memberCount: number }[] };
    expect(list.items.map((item) => item.name)).toEqual(["super", `held-+989120000101`, `held-+989120000102`, `held-+989120000103`, "Support"]);
    expect(list.items[0]).toMatchObject({ isSuper: true, permissionCount: PERMISSION_KEYS.length, memberCount: 1 });
    const found = (await (await call(viewer.cookie, "GET", "/api/v1/admin/roles?q=SUPP")).json()) as { items: { name: string }[] };
    expect(found.items.map((item) => item.name)).toEqual(["Support"]);
    expect(((await (await call(viewer.cookie, "GET", "/api/v1/admin/roles?q=%25")).json()) as { items: unknown[] }).items).toEqual([]);

    const options = (await (await call(viewer.cookie, "GET", "/api/v1/admin/options/roles")).json()) as { items: { name: string }[]; viewerIsSuper: boolean };
    expect(options.viewerIsSuper).toBe(false);
    expect(options.items).toHaveLength(5);
    expect(((await (await call(owner.cookie, "GET", "/api/v1/admin/options/roles")).json()) as { viewerIsSuper: boolean }).viewerIsSuper).toBe(true);

    // Edit: rename, add and remove; the version moves, a save that changes nothing does not move it.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const saved = await call(manager.cookie, "PUT", `/api/v1/admin/roles/${role.id}`, { name: "Care", permissions: ["view-users", "view-roles"], expectedUpdatedAt: role.updatedAt });
    expect(saved.status).toBe(200);
    const edited = (await saved.json()) as { name: string; permissions: string[]; updatedAt: string };
    expect(edited).toMatchObject({ name: "Care", permissions: ["view-users", "view-roles"] });
    expect(edited.updatedAt > role.updatedAt).toBe(true);
    const unchanged = await call(manager.cookie, "PUT", `/api/v1/admin/roles/${role.id}`, { name: "Care", permissions: ["view-roles", "view-users"], expectedUpdatedAt: edited.updatedAt });
    expect(((await unchanged.json()) as { updatedAt: string }).updatedAt).toBe(edited.updatedAt);

    // An old version is stale (409 with the current Role); a held Role cannot be deleted; an unheld one can.
    const stale = await call(manager.cookie, "PUT", `/api/v1/admin/roles/${role.id}`, { name: "Other", permissions: [], expectedUpdatedAt: role.updatedAt });
    expect([stale.status, await codeOf(stale)]).toEqual([409, "stale_version"]);
    await q("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [viewer.id, role.id]);
    const held = await call(manager.cookie, "DELETE", `/api/v1/admin/roles/${role.id}?expectedUpdatedAt=${encodeURIComponent(edited.updatedAt)}`);
    expect([held.status, await codeOf(held)]).toEqual([409, "in_use"]);
    await q("DELETE FROM user_roles WHERE role_id = $1", [role.id]);
    const deleted = await call(manager.cookie, "DELETE", `/api/v1/admin/roles/${role.id}?expectedUpdatedAt=${encodeURIComponent(edited.updatedAt)}`);
    expect(deleted.status).toBe(204);
    expect((await call(manager.cookie, "GET", `/api/v1/admin/roles/${role.id}`)).status).toBe(404);
  });

  it("rejects a bad body or query with 400 validation_failed, a duplicate name with 409, and a malformed id with 404", async () => {
    const post = async (body: unknown) => {
      const response = await call(manager.cookie, "POST", "/api/v1/admin/roles", body);
      return { status: response.status, fieldErrors: ((await response.json()) as { data: { fieldErrors?: Record<string, string[]> } }).data.fieldErrors };
    };
    expect(await post({ name: "a", permissions: [] })).toEqual({ status: 400, fieldErrors: { name: ["too_short"] } });
    expect(await post({ name: "a".repeat(41), permissions: [] })).toEqual({ status: 400, fieldErrors: { name: ["too_long"] } });
    expect(await post({ name: "Support", permissions: ["view-users", "delete-users"] })).toEqual({ status: 400, fieldErrors: { "permissions.1": ["unknown"] } });
    expect(await post({ name: "Support", permissions: ["view-users", "view-users"] })).toEqual({ status: 400, fieldErrors: { permissions: ["duplicate"] } });
    expect(await post({ name: "Support" })).toEqual({ status: 400, fieldErrors: { permissions: ["required"] } });
    expect((await call(manager.cookie, "PUT", `/api/v1/admin/roles/${ZERO}`, { name: "Support", permissions: [] })).status).toBe(400); // no version
    expect((await call(manager.cookie, "DELETE", `/api/v1/admin/roles/${ZERO}`)).status).toBe(400); // no version
    expect((await call(manager.cookie, "GET", "/api/v1/admin/roles?page=0")).status).toBe(400);
    expect((await call(manager.cookie, "GET", "/api/v1/admin/roles/not-a-uuid")).status).toBe(404);
    expect((await call(manager.cookie, "GET", `/api/v1/admin/roles/${ZERO}`)).status).toBe(404);

    expect((await call(manager.cookie, "POST", "/api/v1/admin/roles", { name: "Support", permissions: [] })).status).toBe(201);
    for (const clash of ["support", "  SUPPORT ", "super"]) {
      const duplicate = await call(manager.cookie, "POST", "/api/v1/admin/roles", { name: clash, permissions: [] });
      expect([clash, duplicate.status, await codeOf(duplicate)]).toEqual([clash, 409, "duplicate_name"]);
    }
  });

  it("refuses a Role that breaks a Permission prerequisite with 422 permission_prerequisites, and writes nothing", async () => {
    const created = await call(manager.cookie, "POST", "/api/v1/admin/roles", { name: "Support", permissions: ["edit-users", "manage-roles"] });
    expect(created.status).toBe(422);
    expect(await created.json()).toMatchObject({
      data: {
        code: "permission_prerequisites",
        missing: [
          { key: "edit-users", needs: "view-users" },
          { key: "manage-roles", needs: "view-roles" },
        ],
      },
    });
    expect(await q("SELECT 1 FROM roles WHERE name = 'Support'")).toHaveLength(0);

    const [role] = await q("INSERT INTO roles (name) VALUES ('Care') RETURNING id, updated_at");
    await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, 'view-users'), ($1, 'edit-users')", [role.id]);
    const dropped = await call(manager.cookie, "PUT", `/api/v1/admin/roles/${role.id}`, { name: "Care", permissions: ["edit-users"], expectedUpdatedAt: new Date(role.updated_at).toISOString() });
    expect([dropped.status, await codeOf(dropped)]).toEqual([422, "permission_prerequisites"]);
    expect((await q("SELECT permission_key FROM role_permissions WHERE role_id = $1 ORDER BY 1", [role.id])).map((row) => row.permission_key)).toEqual(["edit-users", "view-users"]);
  });

  it("lets nobody change the Super role: 403 super_required to a non-super User, 409 super_role_protected to a super one", async () => {
    const [superRole] = await q("SELECT id, updated_at FROM roles WHERE is_super");
    const version = new Date(superRole.updated_at).toISOString();
    const everything = [...PERMISSION_KEYS];
    const attempts = [
      { method: "PUT", path: `/api/v1/admin/roles/${superRole.id}`, body: { name: "owner", permissions: everything, expectedUpdatedAt: version } },
      { method: "PUT", path: `/api/v1/admin/roles/${superRole.id}`, body: { name: "super", permissions: [], expectedUpdatedAt: version } },
      { method: "DELETE", path: `/api/v1/admin/roles/${superRole.id}?expectedUpdatedAt=${encodeURIComponent(version)}` },
    ];
    for (const attempt of attempts) {
      const byManager = await call(manager.cookie, attempt.method, attempt.path, attempt.body);
      expect([attempt.method, byManager.status, await codeOf(byManager)]).toEqual([attempt.method, 403, "super_required"]);
      const bySuper = await call(owner.cookie, attempt.method, attempt.path, attempt.body);
      expect([attempt.method, bySuper.status, await codeOf(bySuper)]).toEqual([attempt.method, 409, "super_role_protected"]);
    }
    // Reading it is open to a Role viewer, and nothing changed.
    const detail = (await (await call(viewer.cookie, "GET", `/api/v1/admin/roles/${superRole.id}`)).json()) as { name: string; isSuper: boolean; permissionCount: number };
    expect(detail).toMatchObject({ name: "super", isSuper: true, permissionCount: PERMISSION_KEYS.length });
  });
});
