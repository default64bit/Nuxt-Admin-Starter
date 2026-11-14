// demo-ticket:start (whole file)
// @vitest-environment node
import { fileURLToPath } from "node:url";
import { fetch, setup } from "@nuxt/test-utils/e2e";
import { beforeAll, expect, it } from "vitest";
import { dbSuite, useTestDatabase } from "../support/database";

// Media Off (no storage configuration at all): the app boots and is ready, the upload and variant routes answer "not
// configured", the status says so, and a demo ticket can still be created without an image.
dbSuite("Demo tickets with media storage Off", async () => {
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
  let cookie = "";
  beforeAll(async () => {
    await database.truncate();
    const phone = "+989120000411";
    const [user] = await q("INSERT INTO users (phone_e164, phone_verified_at) VALUES ($1, now()) RETURNING id", [phone]);
    const [role] = await q("INSERT INTO roles (name) VALUES ('held') RETURNING id");
    for (const key of ["view-demo-tickets", "manage-demo-tickets"]) await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)", [role.id, key]);
    await q("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [user.id, role.id]);
    const headers = { "content-type": "application/json", origin: ORIGIN };
    const requested = await fetch("/api/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ phone, locale: "en" }), headers });
    const { testCode } = (await requested.json()) as { testCode: string };
    const verified = await fetch("/api/v1/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code: testCode }), headers });
    cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0]!;
  });

  it("answers not configured on the upload, variant and status routes", async () => {
    const upload = await fetch("/api/v1/admin/media?purpose=demo-ticket-image", { method: "POST", body: "x", headers: { origin: ORIGIN, cookie, "content-type": "image/jpeg" } });
    expect(upload.status).toBe(503);
    expect(((await upload.json()) as { data: { code: string } }).data.code).toBe("media_not_configured");
    expect((await fetch("/_media/images/a.jpg?w=64")).status).toBe(503);
    const status = await fetch("/api/v1/admin/media/status", { headers: { cookie } });
    expect(await status.json()).toMatchObject({ enabled: false });
  });

  it("still creates a ticket without an image, with readiness green", async () => {
    const created = await fetch("/api/v1/admin/demo-tickets", { method: "POST", body: JSON.stringify({ title: "No image" }), headers: { origin: ORIGIN, "content-type": "application/json", cookie } });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { image: unknown }).image).toBeNull();
    expect((await fetch("/api/health/ready")).status).toBe(200);
  });
});
// demo-ticket:end
