// demo-ticket:start (whole file)
// @vitest-environment node
import { fileURLToPath } from "node:url";
import { fetch, setup } from "@nuxt/test-utils/e2e";
import sharp from "sharp";
import { beforeAll, expect, it } from "vitest";
import { dbSuite, useTestDatabase } from "../support/database";

// The media pipeline through the built server, on the in-memory store (.specs/media/spec.md): the raw-body upload with
// its limits and Permission, attaching the image to a demo ticket, and the image variant route.
dbSuite("Demo ticket image and media upload", async () => {
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
        // `memory:` selects the in-process fake of the object store: no RustFS needed.
        s3: { endpoint: "memory:", region: "us-east-1", accessKey: "test-access", secretKey: "test-secret-key", privateBucket: "test-private", publicBucket: "test-public" },
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
    return { cookie: (verified.headers.get("set-cookie") ?? "").split(";")[0]! };
  }

  const upload = (cookie: string | null, body: Uint8Array | string, purpose = "demo-ticket-image") =>
    fetch(`/api/v1/admin/media?purpose=${purpose}`, { method: "POST", body, headers: { origin: ORIGIN, "content-type": "image/jpeg", ...(cookie ? { cookie } : {}) } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = async (response: Response) => (await response.json()) as Record<string, any>;
  const jpeg = () => sharp({ create: { width: 120, height: 80, channels: 3, background: "tomato" } }).jpeg().toBuffer();

  let manager: { cookie: string };
  let viewer: { cookie: string };
  beforeAll(async () => {
    await database.truncate();
    manager = await account("+989120000401", ["view-demo-tickets", "manage-demo-tickets"]);
    viewer = await account("+989120000402", ["view-demo-tickets"]);
  });

  it("answers 401 without a session and 403 without the purpose's Permission", async () => {
    expect((await upload(null, "x")).status).toBe(401);
    expect((await upload(viewer.cookie, "x")).status).toBe(403);
  });

  it("refuses an unknown purpose, a non-image, an empty body and a body over 10 MiB", async () => {
    expect((await upload(manager.cookie, "x", "nope")).status).toBe(400);
    const wrongType = await upload(manager.cookie, "MZ not an image");
    expect([wrongType.status, (await json(wrongType)).data.code]).toEqual([415, "unsupported_type"]);
    expect((await upload(manager.cookie, new Uint8Array(0))).status).toBe(415);
    const huge = await upload(manager.cookie, new Uint8Array(10 * 1024 * 1024 + 1).fill(7));
    expect([huge.status, (await json(huge)).data.code]).toEqual([413, "too_large"]);
  });

  it("stages an upload, attaches it to a new ticket with alt text, and serves its variant", async () => {
    const staged = await upload(manager.cookie, await jpeg());
    expect(staged.status).toBe(201);
    const { id } = await json(staged);
    expect((await fetch(`/api/v1/admin/media/${id}/file`, { headers: { cookie: manager.cookie } })).headers.get("content-type")).toBe("image/jpeg");

    const body = { title: "With image", imageMediaObjectId: id, imageAltFa: "متن", imageAltEn: "Alt" };
    const send = (extra: object) =>
      fetch("/api/v1/admin/demo-tickets", { method: "POST", body: JSON.stringify({ ...body, ...extra }), headers: { origin: ORIGIN, "content-type": "application/json", cookie: manager.cookie } });
    const missingAlt = await send({ imageAltEn: "" });
    expect(missingAlt.status).toBe(400);

    const created = await send({});
    expect(created.status).toBe(201);
    const ticket = await json(created);
    expect(ticket.image).toMatchObject({ mediaObjectId: id, altFa: "متن", altEn: "Alt", width: 120, height: 80 });
    expect(ticket.image.key).toMatch(/^images\/[0-9a-f-]{36}\.jpg$/);

    const variant = await fetch(`/_media/${ticket.image.key}?w=64&h=64&fit=cover&f=webp&q=75`);
    expect([variant.status, variant.headers.get("content-type")]).toEqual([200, "image/webp"]);
    expect((await fetch("/_media/images/missing.jpg?w=64")).status).toBe(404);

    // The same upload cannot be attached to a second ticket.
    expect((await send({ title: "Second" })).status).toBe(422);
  });

  it("reports that media storage is configured", async () => {
    const response = await fetch("/api/v1/admin/media/status", { headers: { cookie: manager.cookie } });
    expect(await json(response)).toEqual({ enabled: true, maxBytes: 10 * 1024 * 1024 });
  });
});
// demo-ticket:end
