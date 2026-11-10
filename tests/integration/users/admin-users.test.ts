// @vitest-environment node
import { fileURLToPath } from "node:url";
import { fetch, setup } from "@nuxt/test-utils/e2e";
import { beforeAll, expect, it } from "vitest";
import { dbSuite, useTestDatabase } from "../support/database";

// The Users API through the built server against a real throwaway database (.specs/users-and-roles/spec.md): the
// happy path, Zod rejection, 401 and 403 per missing key, nobody acting on their own account, the Default admin
// invariant and the `super` rules.
dbSuite("Users API", async () => {
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
  const json = { "content-type": "application/json", origin: ORIGIN };

  async function signIn(phone: string) {
    await q("DELETE FROM otp_send_events"); // a sign-in right after another is not "too soon"
    const requested = await fetch("/api/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ phone, locale: "en" }), headers: json });
    const { testCode } = (await requested.json()) as { testCode: string };
    const verified = await fetch("/api/v1/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code: testCode }), headers: json });
    if (!verified.ok) throw new Error(`sign-in ${phone}: ${requested.status} ${verified.status} ${await verified.text()}`);
    return (verified.headers.get("set-cookie") ?? "").split(";")[0]!;
  }

  // An active account holding one Role with exactly these Permissions (or the seeded `super` Role), signed in.
  async function account(phone: string, permissions: string[] | "super") {
    const [user] = await q("INSERT INTO users (phone_e164, phone_verified_at) VALUES ($1, now()) RETURNING id", [phone]);
    if (permissions === "super") await q("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE is_super", [user.id]);
    else {
      const [role] = await q("INSERT INTO roles (name) VALUES ($1) RETURNING id", [`held-${phone}`]);
      for (const key of permissions) await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)", [role.id, key]);
      await q("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [user.id, role.id]);
    }
    return { id: user.id as string, cookie: await signIn(phone) };
  }

  const call = (cookie: string | null, method: string, path: string, body?: unknown) =>
    fetch(path, {
      method,
      redirect: "manual",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { origin: ORIGIN, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    });
  const codeOf = async (response: Response) => ((await response.json()) as { data?: { code?: string } }).data?.code;
  const fieldErrorsOf = async (response: Response) => ((await response.json()) as { data?: { fieldErrors?: Record<string, string[]> } }).data?.fieldErrors;

  type Detail = { id: string; givenName: string | null; familyName: string | null; phoneE164: string; status: string; updatedAt: string; isSelf: boolean; isDefaultAdmin: boolean; roles: { id: string; name: string; isSuper: boolean }[]; activeSessionCount: number; viewerIsSuper: boolean };
  const detail = async (cookie: string, id: string) => (await (await call(cookie, "GET", `/api/v1/admin/users/${id}`)).json()) as Detail;
  const version = async (id: string) => (await detail(owner.cookie, id)).updatedAt;

  let reader: Awaited<ReturnType<typeof account>>;
  let editor: Awaited<ReturnType<typeof account>>;
  let creator: Awaited<ReturnType<typeof account>>;
  let rolesManager: Awaited<ReturnType<typeof account>>;
  let manager: Awaited<ReturnType<typeof account>>;
  let owner: Awaited<ReturnType<typeof account>>;
  let defaultAdminId: string;
  let supportRole: string;
  let spareRole: string;
  let superRole: string;
  // Signing in is rate limited per address, so the accounts sign in once and every test works from the same set.
  beforeAll(async () => {
    await database.truncate();
    reader = await account("+989120000201", ["view-users"]);
    editor = await account("+989120000202", ["view-users", "edit-users"]);
    creator = await account("+989120000203", ["view-users", "create-users"]);
    rolesManager = await account("+989120000204", ["view-roles", "manage-roles"]);
    manager = await account("+989120000205", ["view-users", "create-users", "edit-users", "disable-users", "view-roles", "manage-roles"]);
    owner = await account("+989120000206", "super");
    const [admin] = await q("INSERT INTO users (phone_e164, phone_verified_at, is_default_admin, given_name, family_name) VALUES ('+989120000299', now(), true, 'Default', 'Admin') RETURNING id");
    defaultAdminId = admin.id;
    await q("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE is_super", [defaultAdminId]);
    supportRole = (await q("INSERT INTO roles (name) VALUES ('Support') RETURNING id"))[0].id;
    spareRole = (await q("INSERT INTO roles (name) VALUES ('Spare') RETURNING id"))[0].id;
    superRole = (await q("SELECT id FROM roles WHERE is_super"))[0].id;
  });

  it("answers 401 without a session and 403 to a User missing any key a route needs, on every route", async () => {
    const stamp = new Date().toISOString();
    // `denied` are Users who hold part of what the route needs but not all of it.
    const routes = [
      { method: "GET", path: "/api/v1/admin/users", denied: [rolesManager] },
      { method: "GET", path: `/api/v1/admin/users/${ZERO}`, denied: [rolesManager] },
      { method: "POST", path: "/api/v1/admin/users", body: { phone: "0912 000 0210", roleIds: [supportRole] }, denied: [reader, creator, rolesManager] },
      { method: "PATCH", path: `/api/v1/admin/users/${ZERO}`, body: { givenName: "A", familyName: "B", expectedUpdatedAt: stamp }, denied: [reader, rolesManager] },
      { method: "PUT", path: `/api/v1/admin/users/${ZERO}/roles`, body: { roleIds: [supportRole], expectedUpdatedAt: stamp }, denied: [reader, editor, rolesManager] },
      { method: "POST", path: `/api/v1/admin/users/${ZERO}/disable`, body: { expectedUpdatedAt: stamp }, denied: [reader, editor, rolesManager] },
      { method: "POST", path: `/api/v1/admin/users/${ZERO}/enable`, body: { expectedUpdatedAt: stamp }, denied: [reader, editor, rolesManager] },
    ];
    for (const route of routes) {
      const guest = await call(null, route.method, route.path, route.body);
      expect([route.method, route.path, guest.status, await codeOf(guest)]).toEqual([route.method, route.path, 401, "unauthenticated"]);
      for (const user of route.denied) {
        const denied = await call(user.cookie, route.method, route.path, route.body);
        expect([route.method, route.path, user.id, denied.status, await codeOf(denied)]).toEqual([route.method, route.path, user.id, 403, "forbidden"]);
      }
    }
  });

  it("creates, lists, reads, edits, re-roles, disables and enables a User", async () => {
    const created = await call(manager.cookie, "POST", "/api/v1/admin/users", { phone: "۰۹۱۲ ۰۰۰ ۰۲۱۱", givenName: " Nia ", familyName: "Rahimi", roleIds: [supportRole, supportRole] });
    expect(created.status).toBe(201);
    const nia = (await created.json()) as Detail;
    expect(nia).toMatchObject({ phoneE164: "+989120000211", givenName: "Nia", familyName: "Rahimi", status: "active", isSelf: false, roles: [{ name: "Support" }] });

    // The list: newest first; search by phone (any form) or name; the Status and Role filters; the count.
    const list = (await (await call(reader.cookie, "GET", "/api/v1/admin/users")).json()) as { total: number; items: Detail[] };
    expect(list.items[0]!.id).toBe(nia.id);
    expect(list.total).toBe(8);
    const byPhone = (await (await call(reader.cookie, "GET", `/api/v1/admin/users?q=${encodeURIComponent("0912 000 0211")}`)).json()) as { items: Detail[] };
    expect(byPhone.items.map((item) => item.id)).toEqual([nia.id]);
    const byName = (await (await call(reader.cookie, "GET", "/api/v1/admin/users?q=RAHI")).json()) as { items: Detail[] };
    expect(byName.items.map((item) => item.id)).toEqual([nia.id]);
    expect(((await (await call(reader.cookie, "GET", "/api/v1/admin/users?q=%25")).json()) as { items: unknown[] }).items).toEqual([]);
    const byRole = (await (await call(reader.cookie, "GET", `/api/v1/admin/users?role=${supportRole}&status=active`)).json()) as { items: Detail[] };
    expect(byRole.items.map((item) => item.id)).toEqual([nia.id]);
    expect(((await (await call(reader.cookie, "GET", "/api/v1/admin/users?status=disabled")).json()) as { total: number }).total).toBe(0);

    // The page read says whether the viewer is super and whether the account is their own.
    expect(await detail(owner.cookie, nia.id)).toMatchObject({ viewerIsSuper: true, isSelf: false });
    expect(await detail(owner.cookie, owner.id)).toMatchObject({ isSelf: true });
    expect((await detail(manager.cookie, nia.id)).viewerIsSuper).toBe(false);

    // Names: the version moves on a change, not on a save that changes nothing.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const renamed = await call(editor.cookie, "PATCH", `/api/v1/admin/users/${nia.id}`, { givenName: "Nina", familyName: "Rahimi", expectedUpdatedAt: nia.updatedAt });
    expect(renamed.status).toBe(200);
    const edited = (await renamed.json()) as Detail;
    expect(edited.givenName).toBe("Nina");
    expect(edited.updatedAt > nia.updatedAt).toBe(true);
    const unchanged = await call(editor.cookie, "PATCH", `/api/v1/admin/users/${nia.id}`, { givenName: "Nina", familyName: "Rahimi", expectedUpdatedAt: edited.updatedAt });
    expect(((await unchanged.json()) as Detail).updatedAt).toBe(edited.updatedAt);

    // An old version is stale (409 with the account as it is now).
    const stale = await call(editor.cookie, "PATCH", `/api/v1/admin/users/${nia.id}`, { givenName: "Old", familyName: "Name", expectedUpdatedAt: nia.updatedAt });
    expect([stale.status, await codeOf(stale)]).toEqual([409, "stale_version"]);

    // Roles: the whole set is replaced.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const reroled = await call(manager.cookie, "PUT", `/api/v1/admin/users/${nia.id}/roles`, { roleIds: [spareRole], expectedUpdatedAt: edited.updatedAt });
    expect(reroled.status).toBe(200);
    const roled = (await reroled.json()) as Detail;
    expect(roled.roles.map((role) => role.name)).toEqual(["Spare"]);
    expect(roled.updatedAt > edited.updatedAt).toBe(true);

    // Disable: the account's sessions end at once, and enabling does not bring them back.
    const niaCookie = await signIn("+989120000211");
    expect((await call(niaCookie, "GET", "/api/v1/admin/options/roles")).status).toBe(403); // signed in, holds no key
    expect((await detail(owner.cookie, nia.id)).activeSessionCount).toBe(1);
    const disabled = await call(manager.cookie, "POST", `/api/v1/admin/users/${nia.id}/disable`, { expectedUpdatedAt: await version(nia.id) });
    expect(disabled.status).toBe(200);
    const off = (await disabled.json()) as Detail;
    expect(off).toMatchObject({ status: "disabled", activeSessionCount: 0 });
    expect((await call(niaCookie, "GET", "/api/v1/admin/options/roles")).status).toBe(401);
    expect((await q("SELECT revoked_reason FROM auth_sessions WHERE user_id = $1", [nia.id])).map((row) => row.revoked_reason)).toEqual(["account_disabled"]);
    const again = await call(manager.cookie, "POST", `/api/v1/admin/users/${nia.id}/disable`, { expectedUpdatedAt: off.updatedAt });
    expect([again.status, await codeOf(again)]).toEqual([409, "invalid_transition"]);
    const enabled = await call(manager.cookie, "POST", `/api/v1/admin/users/${nia.id}/enable`, { expectedUpdatedAt: off.updatedAt });
    expect(((await enabled.json()) as Detail).status).toBe("active");
    expect((await call(niaCookie, "GET", "/api/v1/admin/options/roles")).status).toBe(401);
  });

  it("rejects a bad body or query with 400 validation_failed, a repeated phone with 409, and a malformed id with 404", async () => {
    const post = async (body: unknown) => {
      const response = await call(manager.cookie, "POST", "/api/v1/admin/users", body);
      return { status: response.status, fieldErrors: await fieldErrorsOf(response) };
    };
    expect(await post({ phone: "12345", roleIds: [supportRole] })).toEqual({ status: 400, fieldErrors: { phone: ["invalid"] } });
    expect(await post({ roleIds: [supportRole] })).toEqual({ status: 400, fieldErrors: { phone: ["required"] } });
    expect(await post({ phone: "0912 000 0220", givenName: "Solo", roleIds: [supportRole] })).toEqual({ status: 400, fieldErrors: { familyName: ["required"] } });
    expect(await post({ phone: "0912 000 0220", roleIds: [] })).toEqual({ status: 400, fieldErrors: { roleIds: ["required"] } });
    expect(await post({ phone: "0912 000 0220" })).toEqual({ status: 400, fieldErrors: { roleIds: ["required"] } });
    expect(await post({ phone: "0912 000 0220", roleIds: ["nope"] })).toEqual({ status: 400, fieldErrors: { "roleIds.0": ["invalid"] } });
    expect((await post({ phone: "0912 000 0220", roleIds: [supportRole], isDefaultAdmin: true })).status).toBe(400);
    expect(await post({ phone: "0912 000 0220", roleIds: [ZERO] })).toEqual({ status: 400, fieldErrors: { roleIds: ["unknown"] } });
    expect((await q("SELECT 1 FROM users WHERE phone_e164 = '+989120000220'")).length).toBe(0);

    const taken = await call(manager.cookie, "POST", "/api/v1/admin/users", { phone: "0912 000 0201", roleIds: [supportRole] });
    expect(taken.status).toBe(409);
    expect(((await taken.json()) as { data: { code: string; userId: string } }).data).toMatchObject({ code: "phone_in_use", userId: reader.id });

    const stamp = await version(reader.id);
    const patch = async (body: unknown) => (await call(manager.cookie, "PATCH", `/api/v1/admin/users/${reader.id}`, body)).status;
    expect(await patch({ givenName: "A", familyName: "B" })).toBe(400); // no version
    expect(await patch({ givenName: "A", familyName: "B", phone: "0912 000 0000", expectedUpdatedAt: stamp })).toBe(400); // a stray key
    expect(await patch({ givenName: " ", familyName: "B", expectedUpdatedAt: stamp })).toBe(400);
    expect((await call(manager.cookie, "PUT", `/api/v1/admin/users/${reader.id}/roles`, { roleIds: [], expectedUpdatedAt: stamp })).status).toBe(400);
    expect((await call(manager.cookie, "POST", `/api/v1/admin/users/${reader.id}/disable`, {})).status).toBe(400);
    for (const query of ["page=0", "status=banned", "role=nope"]) expect((await call(manager.cookie, "GET", `/api/v1/admin/users?${query}`)).status, query).toBe(400);
    expect((await call(manager.cookie, "GET", "/api/v1/admin/users/not-a-uuid")).status).toBe(404);
    expect((await call(manager.cookie, "GET", `/api/v1/admin/users/${ZERO}`)).status).toBe(404);
    expect((await call(manager.cookie, "POST", `/api/v1/admin/users/${ZERO}/disable`, { expectedUpdatedAt: stamp })).status).toBe(404);
  });

  it("lets nobody disable themselves or change their own Roles, and keeps the Default admin enabled and super", async () => {
    const own = async (cookie: string, id: string) => {
      const stamp = await version(id);
      const disable = await call(cookie, "POST", `/api/v1/admin/users/${id}/disable`, { expectedUpdatedAt: stamp });
      const roles = await call(cookie, "PUT", `/api/v1/admin/users/${id}/roles`, { roleIds: [supportRole], expectedUpdatedAt: stamp });
      return [disable.status, await codeOf(disable), roles.status, await codeOf(roles)];
    };
    expect(await own(manager.cookie, manager.id)).toEqual([403, "own_account", 403, "own_account"]);
    // A super User is no exception, and the Default admin acting on themselves is refused the same way.
    expect(await own(owner.cookie, owner.id)).toEqual([403, "own_account", 403, "own_account"]);
    expect((await q("SELECT status FROM users WHERE id = $1", [manager.id]))[0].status).toBe("active");

    // The Default admin cannot be disabled, even by a super User, and keeps `super` through a Role edit.
    const stamp = await version(defaultAdminId);
    const disable = await call(owner.cookie, "POST", `/api/v1/admin/users/${defaultAdminId}/disable`, { expectedUpdatedAt: stamp });
    expect([disable.status, await codeOf(disable)]).toEqual([409, "default_admin_protected"]);
    const strip = await call(owner.cookie, "PUT", `/api/v1/admin/users/${defaultAdminId}/roles`, { roleIds: [supportRole], expectedUpdatedAt: stamp });
    expect([strip.status, await codeOf(strip)]).toEqual([409, "default_admin_protected"]);
    const extra = await call(owner.cookie, "PUT", `/api/v1/admin/users/${defaultAdminId}/roles`, { roleIds: [superRole, supportRole], expectedUpdatedAt: stamp });
    expect(extra.status).toBe(200);
    expect((await q("SELECT status FROM users WHERE id = $1", [defaultAdminId]))[0].status).toBe("active");
    expect((await q("SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2", [defaultAdminId, superRole])).length).toBe(1);
    await q("DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2", [defaultAdminId, supportRole]);
  });

  it("lets only a super User grant `super` or act on a User who holds it", async () => {
    const stamp = await version(owner.id);
    const disable = await call(manager.cookie, "POST", `/api/v1/admin/users/${owner.id}/disable`, { expectedUpdatedAt: stamp });
    expect([disable.status, await codeOf(disable)]).toEqual([403, "super_required"]);
    const reroled = await call(manager.cookie, "PUT", `/api/v1/admin/users/${owner.id}/roles`, { roleIds: [supportRole], expectedUpdatedAt: stamp });
    expect([reroled.status, await codeOf(reroled)]).toEqual([403, "super_required"]);
    const grant = await call(manager.cookie, "PUT", `/api/v1/admin/users/${reader.id}/roles`, { roleIds: [superRole], expectedUpdatedAt: await version(reader.id) });
    expect([grant.status, await codeOf(grant)]).toEqual([403, "super_required"]);
    const create = await call(manager.cookie, "POST", "/api/v1/admin/users", { phone: "0912 000 0230", roleIds: [superRole] });
    expect([create.status, await codeOf(create)]).toEqual([403, "super_required"]);
    expect((await q("SELECT 1 FROM users WHERE phone_e164 = '+989120000230'")).length).toBe(0);

    // A super User may.
    const made = await call(owner.cookie, "POST", "/api/v1/admin/users", { phone: "0912 000 0231", roleIds: [superRole] });
    expect(made.status).toBe(201);
    expect(((await made.json()) as Detail).roles).toMatchObject([{ isSuper: true }]);
  });

  it("serves the Users strip to `view-users` only, with the live total and disabled counts", async () => {
    const path = "/api/v1/admin/analytics/strips/users";
    const guest = await call(null, "GET", path);
    expect([guest.status, await codeOf(guest)]).toEqual([401, "unauthenticated"]);
    const denied = await call(rolesManager.cookie, "GET", path);
    expect([denied.status, await codeOf(denied)]).toEqual([403, "forbidden"]);

    const [{ total, disabled }] = await q("SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'disabled')::int AS disabled FROM users");
    const ok = await call(reader.cookie, "GET", path);
    expect(ok.status).toBe(200);
    const strip = (await ok.json()) as { newAccounts: { current: number; previous: number }; sparkline: { day: string; count: number }[]; total: number; disabled: number };
    expect(strip).toMatchObject({ total, disabled, newAccounts: { current: total, previous: 0 } });
    expect(strip.sparkline).toHaveLength(30);
    expect(strip.sparkline.reduce((sum, entry) => sum + entry.count, 0)).toBe(total);
  });
});
