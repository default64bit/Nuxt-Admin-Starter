// @vitest-environment node
import { fileURLToPath } from "node:url";
import { fetch, setup } from "@nuxt/test-utils/e2e";
import { beforeEach, expect, it } from "vitest";
import { dbSuite, useTestDatabase } from "../support/database";

// My account through the built server against a real throwaway database (.specs/users-and-roles/spec.md): a User
// edits their own names and changes their phone through a code sent to the new number.
dbSuite("my account", async () => {
  const database = useTestDatabase();
  const ORIGIN = "http://localhost:3000";

  await setup({
    rootDir: fileURLToPath(new URL("../..", import.meta.url)),
    server: true,
    setupTimeout: 240_000,
    nuxtConfig: {
      // `test` with no provider set means the mock adapter, which returns the code as `testCode`.
      runtimeConfig: {
        appEnv: "test",
        databaseUrl: database.url,
        session: { password: "test-session-password-0123456789abcdef" },
        ipHashSecret: "test-ip-hash-secret-0123456789abcdef",
        public: { siteUrl: ORIGIN },
      },
    },
  });

  const OWN = "+989120000011";
  const NEW = "+989120000012";
  const HOLDER = "+989120000013";
  const q = async (sql: string, params: unknown[] = []) => (await database.pool.query(sql, params)).rows;

  const send = (method: string, path: string, body?: unknown, cookie?: string) =>
    fetch(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    });
  const post = (path: string, body: unknown, cookie?: string) => send("POST", path, body, cookie);

  async function signIn(phone: string) {
    const requested = (await (await post("/api/v1/auth/otp/request", { phone, locale: "en" })).json()) as { testCode: string };
    const verified = await post("/api/v1/auth/otp/verify", { phone, code: requested.testCode });
    return (verified.headers.get("set-cookie") ?? "").split(";")[0]!;
  }
  const requestChange = (cookie: string, phone: string) => post("/api/v1/admin/account/phone-change/request", { phone, locale: "en" }, cookie);
  const verifyChange = (cookie: string, phone: string, code: string) => post("/api/v1/admin/account/phone-change/verify", { phone, code }, cookie);
  const phoneOfOwner = async () => (await q("SELECT phone_e164 FROM users WHERE id = $1", [ownerId]))[0]!.phone_e164 as string;

  let ownerId: string;
  let cookie: string;
  beforeEach(async () => {
    await database.truncate();
    // An ordinary User: signed in, holding no Permission at all.
    ownerId = (await q("INSERT INTO users (phone_e164, given_name, family_name) VALUES ($1, 'Ada', 'Lovelace') RETURNING id", [OWN]))[0]!.id as string;
    await q("INSERT INTO roles (name) VALUES ('Plain')");
    await q("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'Plain'", [ownerId]);
    cookie = await signIn(OWN);
    await q("DELETE FROM otp_send_events");
  });

  it("answers a guest 401 on every endpoint and lets any signed-in User through", async () => {
    expect((await send("GET", "/api/v1/admin/account")).status).toBe(401);
    expect((await send("PATCH", "/api/v1/admin/account", { givenName: "A", familyName: "B" })).status).toBe(401);
    expect((await post("/api/v1/admin/account/phone-change/request", { phone: NEW, locale: "en" })).status).toBe(401);
    expect((await post("/api/v1/admin/account/phone-change/verify", { phone: NEW, code: "12345" })).status).toBe(401);

    const own = await send("GET", "/api/v1/admin/account", undefined, cookie);
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toContain("no-store");
    expect(await own.json()).toEqual({ givenName: "Ada", familyName: "Lovelace", phone: OWN });
  });

  it("saves the cleaned names, shows them in the session, and refuses invalid names and stray keys", async () => {
    const saved = await send("PATCH", "/api/v1/admin/account", { givenName: "  سارا ", familyName: "احمدی   نیا" }, cookie);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ givenName: "سارا", familyName: "احمدی نیا", phone: OWN });
    expect((await (await send("GET", "/api/v1/auth/session", undefined, cookie)).json()).user).toMatchObject({ givenName: "سارا", familyName: "احمدی نیا" });

    const empty = await send("PATCH", "/api/v1/admin/account", { givenName: "  ", familyName: "X" }, cookie);
    expect(empty.status).toBe(400);
    expect((await empty.json()).data.fieldErrors).toEqual({ givenName: ["required"] });
    expect((await send("PATCH", "/api/v1/admin/account", { givenName: "A", familyName: "B", phone: NEW }, cookie)).status).toBe(400);
    expect(await phoneOfOwner()).toBe(OWN);
  });

  it("changes the phone with a code sent to the new number, keeps this session and ends the others", async () => {
    const other = (await q("INSERT INTO auth_sessions (user_id, token_hash, idle_expires_at, absolute_expires_at) VALUES ($1, 'other-device', now() + interval '1 hour', now() + interval '2 hours') RETURNING id", [ownerId]))[0]!.id as string;

    const requested = await requestChange(cookie, NEW);
    expect(requested.status).toBe(200);
    const { testCode } = (await requested.json()) as { testCode: string };
    // The code is bound to the User and to the new number; the old number keeps working until it is used.
    expect(await q("SELECT purpose, user_id FROM otp_challenges WHERE phone_e164 = $1", [NEW])).toEqual([{ purpose: "phone_change", user_id: ownerId }]);
    expect(await phoneOfOwner()).toBe(OWN);

    const verified = await verifyChange(cookie, NEW, testCode);
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ phone: NEW });
    expect(await phoneOfOwner()).toBe(NEW);
    expect(await q("SELECT code FROM otp_challenges WHERE phone_e164 = $1", [NEW])).toEqual([{ code: null }]);
    expect((await q("SELECT revoked_reason FROM auth_sessions WHERE id = $1", [other]))[0]!.revoked_reason).toBe("phone_changed");
    expect((await (await send("GET", "/api/v1/auth/session", undefined, cookie)).json()).loggedIn).toBe(true);
    expect(await (await send("GET", "/api/v1/admin/account", undefined, cookie)).json()).toMatchObject({ phone: NEW });
  });

  it("refuses the current number, and keeps the old number after a wrong code", async () => {
    const current = await requestChange(cookie, OWN);
    expect(current.status).toBe(400);
    expect((await current.json()).data.fieldErrors).toEqual({ phone: ["current_phone"] });

    const { testCode } = (await (await requestChange(cookie, NEW)).json()) as { testCode: string };
    const wrong = await verifyChange(cookie, NEW, testCode === "00000" ? "11111" : "00000");
    expect(wrong.status).toBe(422);
    expect((await wrong.json()).data.code).toBe("otp_incorrect");
    expect(await phoneOfOwner()).toBe(OWN);
    // The challenge survives a wrong attempt: the right code still works.
    expect((await verifyChange(cookie, NEW, testCode)).status).toBe(200);
  });

  it("says a number is taken only at verification, with the right code, and changes nothing", async () => {
    await q("INSERT INTO users (phone_e164) VALUES ($1)", [HOLDER]);
    const unregistered = await requestChange(cookie, NEW);
    await q("DELETE FROM otp_send_events");
    const registered = await requestChange(cookie, HOLDER);
    // The request step answers like for any other number.
    expect(registered.status).toBe(unregistered.status);
    const body = (await registered.json()) as { testCode: string };
    expect(Object.keys(body).sort()).toEqual(Object.keys(await unregistered.json()).sort());

    const taken = await verifyChange(cookie, HOLDER, body.testCode);
    expect(taken.status).toBe(409);
    // The answer names no account.
    expect((await taken.json()).data).toEqual({ code: "phone_in_use" });
    expect(await phoneOfOwner()).toBe(OWN);
  });

  it("does not let another User use a code that was asked for by someone else", async () => {
    const { testCode } = (await (await requestChange(cookie, NEW)).json()) as { testCode: string };
    await q("INSERT INTO users (phone_e164, given_name) VALUES ($1, 'Mallory')", [HOLDER]);
    const otherCookie = await signIn(HOLDER);
    const stolen = await verifyChange(otherCookie, NEW, testCode);
    expect(stolen.status).toBe(422);
    expect((await stolen.json()).data.code).toBe("otp_expired");
    expect(await phoneOfOwner()).toBe(OWN);
  });
});
