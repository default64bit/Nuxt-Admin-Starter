import type { Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { gotoHydrated } from "./page";

dotenv.config({ quiet: true });

/**
 * Creates (and later removes) an enabled account with the given Permissions (or the seeded `super` Role) and signs
 * the page's browser context in through the real OTP endpoints. Needs a server with the mock SMS adapter and
 * `NUXT_APP_ENV` local or test, so the code request returns `testCode`. An account that performed audited actions
 * cannot be deleted (audit events are append-only and reference it), so cleanup then only strips its Roles and the
 * next run reuses the account.
 */
export interface AdminAccount {
  phone: string;
  signIn: (page: Page) => Promise<void>;
  /** Moves the account's live sessions this far into the past, as if that long had gone by since the last request. */
  ageSessions: (minutes: number) => Promise<void>;
  cleanup: () => Promise<void>;
}

export async function createAdminAccount(phone: string, options: { permissions?: string[]; givenName?: string } = {}): Promise<AdminAccount> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as Record<string, unknown>[];
  const roleName = `e2e-${phone}`;

  const cleanup = async () => {
    await q("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE phone_e164 = $1)", [phone]);
    for (const table of ["otp_send_events", "otp_challenges"]) await q(`DELETE FROM ${table} WHERE phone_e164 = $1`, [phone]);
    await q("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE phone_e164 = $1)", [phone]);
    await q("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name = $1)", [roleName]);
    await q("DELETE FROM roles WHERE name = $1", [roleName]);
    try {
      await q("DELETE FROM users WHERE phone_e164 = $1", [phone]);
    } catch (error) {
      if (!["23001", "23503"].includes((error as { code?: string }).code ?? "")) throw error; // referenced by audit events: keep, the Roles are gone
    }
  };
  await cleanup();

  const [user] = await q(
    "INSERT INTO users (phone_e164, phone_verified_at, status, given_name) VALUES ($1, now(), 'active', $2) ON CONFLICT (phone_e164) DO UPDATE SET status = 'active', phone_verified_at = now(), given_name = $2 RETURNING id",
    [phone, options.givenName ?? null],
  );
  let roleId: string;
  if (options.permissions) {
    const [role] = await q("INSERT INTO roles (name) VALUES ($1) RETURNING id", [roleName]);
    roleId = role!.id as string;
    for (const key of options.permissions) await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)", [roleId, key]);
  } else {
    const [role] = await q("SELECT id FROM roles WHERE is_super");
    roleId = role!.id as string;
  }
  await q("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [user!.id, roleId]);

  return {
    phone,
    cleanup: async () => {
      await cleanup();
      await pool.end();
    },
    ageSessions: async (minutes) => {
      await q("UPDATE auth_sessions SET last_seen_at = last_seen_at - make_interval(mins => $2::int) WHERE user_id = $1 AND revoked_at IS NULL", [user!.id, minutes]);
    },
    signIn: async (page) => {
      // Each test signs in afresh; clear the account's send limits so a second sign-in is not "too soon".
      for (const table of ["otp_send_events", "otp_challenges"]) await q(`DELETE FROM ${table} WHERE phone_e164 = $1`, [phone]);
      await gotoHydrated(page, "/en");
      await page.evaluate(async (number) => {
        const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const requested = await (await post("/api/v1/auth/otp/request", { phone: number, locale: "en" })).json();
        const verified = await post("/api/v1/auth/otp/verify", { phone: number, code: requested.testCode });
        if (!verified.ok) throw new Error(`sign-in failed: ${verified.status}`);
      }, phone);
    },
  };
}
