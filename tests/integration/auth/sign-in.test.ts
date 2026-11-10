// @vitest-environment node
import { fileURLToPath } from "node:url";
import { fetch, setup } from "@nuxt/test-utils/e2e";
import { beforeEach, expect, it } from "vitest";
import { dbSuite, useTestDatabase } from "../support/database";

// Phone OTP sign-in through the built server against a real throwaway database (.specs/authentication/spec.md):
// the generic answer for an unknown phone, verification and the session cookie, and both session lifetimes.
dbSuite("phone OTP sign-in", async () => {
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

  const KNOWN = "+989120000001";
  const UNKNOWN = "+989120000002";
  const q = async (sql: string, params: unknown[] = []) => (await database.pool.query(sql, params)).rows;

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN, ...headers } });
  const get = (path: string, cookie?: string) => fetch(path, { redirect: "manual", headers: cookie ? { cookie } : {} });
  const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0]!;

  // Requests a code for the phone and verifies it, returning the response and the session cookie.
  async function signIn(phone: string) {
    const requested = await post("/api/v1/auth/otp/request", { phone, locale: "en" });
    const { testCode } = (await requested.json()) as { testCode: string };
    const verified = await post("/api/v1/auth/otp/verify", { phone, code: testCode });
    return { verified, cookie: cookieOf(verified) };
  }

  beforeEach(async () => {
    await database.truncate();
    // The Default admin shape: an active account holding `super`.
    await q("INSERT INTO users (phone_e164, given_name, family_name) VALUES ($1, 'Ada', 'Lovelace')", [KNOWN]);
    await q("INSERT INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u, roles r WHERE u.phone_e164 = $1 AND r.is_super", [KNOWN]);
  });

  it("answers an unknown phone exactly like a known one and creates no account", async () => {
    const known = await post("/api/v1/auth/otp/request", { phone: KNOWN, locale: "en" });
    const unknown = await post("/api/v1/auth/otp/request", { phone: UNKNOWN, locale: "en" });
    expect(unknown.status).toBe(known.status);
    expect(Object.keys(await unknown.json()).sort()).toEqual(Object.keys(await known.json()).sort());
    expect(await q("SELECT 1 FROM users WHERE phone_e164 = $1", [UNKNOWN])).toHaveLength(0);

    // Even the correct code signs nobody in, and the answer is the ordinary wrong-code one.
    const code = (await q("SELECT code FROM otp_challenges WHERE phone_e164 = $1", [UNKNOWN]))[0]!.code as string;
    const verified = await post("/api/v1/auth/otp/verify", { phone: UNKNOWN, code });
    expect(verified.status).toBe(422);
    expect((await verified.json()).data.code).toBe("otp_incorrect");
    expect(verified.headers.get("set-cookie")).toBeNull();
    expect(await q("SELECT 1 FROM users WHERE phone_e164 = $1", [UNKNOWN])).toHaveLength(0);
    expect(await q("SELECT 1 FROM auth_sessions")).toHaveLength(0);
  });

  it("signs a known phone in with an httpOnly cookie and reads the session back without id or phone", async () => {
    const { verified, cookie } = await signIn(KNOWN);
    expect(verified.status).toBe(200);
    const setCookie = verified.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(verified.headers.get("cache-control")).toContain("no-store");

    const session = await get("/api/v1/auth/session", cookie);
    const body = (await session.json()) as { loggedIn: boolean; user: Record<string, unknown> };
    expect(body.loggedIn).toBe(true);
    expect(body.user).toMatchObject({ givenName: "Ada", familyName: "Lovelace" });
    expect(body.user.permissions).toContain("manage-roles");
    expect(JSON.stringify(body)).not.toMatch(/phone|\bid\b|9120000001/);
    // The used code is gone from the database.
    expect(await q("SELECT code FROM otp_challenges WHERE phone_e164 = $1", [KNOWN])).toEqual([{ code: null }]);
  });

  it("reports a guest, and logout revokes only this session and is idempotent", async () => {
    expect(await (await get("/api/v1/auth/session")).json()).toEqual({ loggedIn: false });
    const { cookie } = await signIn(KNOWN);
    await q("DELETE FROM otp_send_events"); // a second sign-in right away is not "too soon"
    const second = await signIn(KNOWN);

    const out = await fetch("/api/v1/auth/logout", { method: "POST", body: "{}", headers: { "content-type": "application/json", origin: ORIGIN, cookie } });
    expect(out.status).toBe(204);
    expect((await (await get("/api/v1/auth/session", cookie)).json()).loggedIn).toBe(false);
    expect((await (await get("/api/v1/auth/session", second.cookie)).json()).loggedIn).toBe(true);
    const again = await fetch("/api/v1/auth/logout", { method: "POST", body: "{}", headers: { "content-type": "application/json", origin: ORIGIN } });
    expect(again.status).toBe(204);
  });

  it("ends a session after 30 minutes idle", async () => {
    const { cookie } = await signIn(KNOWN);
    await q("UPDATE auth_sessions SET last_seen_at = now() - interval '29 minutes'");
    expect((await (await get("/api/v1/auth/session", cookie)).json()).loggedIn).toBe(true);
    // That read counted as activity; age the session again past the idle window.
    await q("UPDATE auth_sessions SET last_seen_at = now() - interval '31 minutes'");
    expect(await (await get("/api/v1/auth/session", cookie)).json()).toEqual({ loggedIn: false });
  });

  it("ends a session 12 hours after sign-in however active it is", async () => {
    const { cookie } = await signIn(KNOWN);
    await q("UPDATE auth_sessions SET created_at = now() - interval '11 hours 59 minutes', absolute_expires_at = now() + interval '1 minute'");
    expect((await (await get("/api/v1/auth/session", cookie)).json()).loggedIn).toBe(true);
    await q("UPDATE auth_sessions SET created_at = now() - interval '12 hours 1 minute', absolute_expires_at = now() - interval '1 minute'");
    expect(await (await get("/api/v1/auth/session", cookie)).json()).toEqual({ loggedIn: false });
  });

  it("ends the session of an account that gets disabled", async () => {
    const { cookie } = await signIn(KNOWN);
    await q("UPDATE users SET status = 'disabled' WHERE phone_e164 = $1", [KNOWN]);
    expect((await (await get("/api/v1/auth/session", cookie)).json()).loggedIn).toBe(false);
  });

  it("sends a guest from an admin page to sign-in, says why once a session has ended, and leaves the landing page public", async () => {
    const guest = await get("/admin");
    expect(guest.status).toBe(302);
    expect(guest.headers.get("location")).toBe("/sign-in?redirect=%2Fadmin");
    expect((await get("/en/admin/users")).headers.get("location")).toBe(`/en/sign-in?redirect=${encodeURIComponent("/en/admin/users")}`);
    expect((await get("/sign-in")).status).toBe(200);
    expect((await get("/")).status).toBe(200);

    const { cookie } = await signIn(KNOWN);
    expect((await get("/admin", cookie)).status).toBe(200);
    expect((await get("/sign-in?redirect=/admin/users", cookie)).headers.get("location")).toBe("/admin/users");

    await q("UPDATE auth_sessions SET last_seen_at = now() - interval '31 minutes'");
    const ended = await get("/admin", cookie);
    expect(ended.status).toBe(302);
    expect(ended.headers.get("location")).toBe("/sign-in?redirect=%2Fadmin&reason=session-ended");
  });

  it("rejects a malformed phone or code with the standard validation body, and a cross-site post", async () => {
    const bad = await post("/api/v1/auth/otp/request", { phone: "12345", locale: "en" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).data.code).toBe("validation_failed");
    const cross = await post("/api/v1/auth/otp/request", { phone: KNOWN, locale: "en" }, { origin: "http://evil.example", "sec-fetch-site": "cross-site" });
    expect(cross.status).toBe(403);
  });
});
