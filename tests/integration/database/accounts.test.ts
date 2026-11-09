// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PERMISSION_KEYS } from "../../../shared/constants/permissions";
import * as schema from "../../../server/database/schema";
import { reconcilePermissionCatalog, runSeeds } from "../../../server/database/seeds";
import { permissionKeysForUser } from "../../../server/repositories/access.repository";
import { dbSuite, useTestDatabase } from "../support/database";

// Real PostgreSQL: the production seed (Permission reconcile, `super`, Default admin) and the Super role trigger.
dbSuite("accounts schema and production seed", () => {
  const database = useTestDatabase();
  const q = async (sql: string, params: unknown[] = []) => (await database.pool.query(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => Number((await q(sql, params))[0].count);
  const rejection = async (promise: Promise<unknown>) => (await promise.then(() => null, (error: unknown) => error)) as { code?: string; message: string } | null;

  beforeEach(() => database.truncate()); // empties every table, then the harness re-runs the Permission reconcile

  describe("the seed", () => {
    it("inserts every key, creates only the super Role and grants it every key", async () => {
      expect(await count("SELECT count(*) FROM permissions")).toBe(PERMISSION_KEYS.length);
      expect(await q("SELECT name, is_super FROM roles")).toEqual([{ name: "super", is_super: true }]);
      const granted = (await q("SELECT permission_key FROM role_permissions")).map((row) => row.permission_key as string);
      expect(granted.sort()).toEqual([...PERMISSION_KEYS].sort());
    });

    it("is add-only: a new key is granted to super, and nothing else is touched or removed", async () => {
      await q("INSERT INTO roles (name) VALUES ('Support')");
      await q("INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'view-users' FROM roles WHERE name = 'Support'");
      // The state before a key existed: the trigger is off only for this setup, and back on when the seed runs.
      await q("ALTER TABLE role_permissions DISABLE TRIGGER role_permissions_protect_super");
      await q("DELETE FROM role_permissions WHERE permission_key = 'view-audit-log'");
      await q("ALTER TABLE role_permissions ENABLE TRIGGER role_permissions_protect_super");
      await q("DELETE FROM permissions WHERE key = 'view-audit-log'");
      await q("INSERT INTO permissions (key) VALUES ('removed-from-code')"); // an old key is never removed

      await runSeeds(database.db, {});

      expect(await count("SELECT count(*) FROM role_permissions WHERE permission_key = 'view-audit-log'")).toBe(1);
      expect(await count("SELECT count(*) FROM permissions WHERE key = 'removed-from-code'")).toBe(1);
      expect(await count("SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Support'")).toBe(1);
      expect(await count("SELECT count(*) FROM roles")).toBe(2);
    });

    it("seeds the Default admin once from env: one account holding super", async () => {
      const report = await runSeeds(database.db, { DEFAULT_ADMIN_PHONE: "09123456789", DEFAULT_ADMIN_GIVEN_NAME: "Ada", DEFAULT_ADMIN_FAMILY_NAME: "Lovelace" });
      expect(report.applied).toEqual(["001-default-admin"]);
      const [admin] = await database.db.select().from(schema.users).where(eq(schema.users.isDefaultAdmin, true));
      expect(admin).toMatchObject({ phoneE164: "+989123456789", givenName: "Ada", familyName: "Lovelace", status: "active" });
      expect(await q("SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1", [admin!.id])).toEqual([{ name: "super" }]);
      expect(await permissionKeysForUser(database.db, admin!.id)).toEqual({ isSuper: true, keys: [...PERMISSION_KEYS].sort() });
    });

    it("never alters the Default admin on a later run, whatever the env says", async () => {
      await runSeeds(database.db, { DEFAULT_ADMIN_PHONE: "09123456789", DEFAULT_ADMIN_GIVEN_NAME: "Ada" });
      await q("UPDATE users SET given_name = 'Renamed' WHERE is_default_admin");
      const report = await runSeeds(database.db, { DEFAULT_ADMIN_PHONE: "09350000000", DEFAULT_ADMIN_GIVEN_NAME: "Other" });
      expect(report).toMatchObject({ applied: [], skipped: ["001-default-admin"] });
      expect(await q("SELECT phone_e164, given_name FROM users")).toEqual([{ phone_e164: "+989123456789", given_name: "Renamed" }]);
    });

    it("warns, skips without recording and retries next run when the phone is unset", async () => {
      const first = await runSeeds(database.db, {});
      expect(first.applied).toEqual([]);
      expect(first.warnings.join(" ")).toContain("DEFAULT_ADMIN_PHONE");
      expect(await count("SELECT count(*) FROM seed_versions")).toBe(0);
      expect(await count("SELECT count(*) FROM users")).toBe(0);

      expect((await runSeeds(database.db, { DEFAULT_ADMIN_PHONE: "09123456789" })).applied).toEqual(["001-default-admin"]);
      expect(await count("SELECT count(*) FROM users")).toBe(1);
    });

    it("refuses an invalid phone without recording progress", async () => {
      await expect(runSeeds(database.db, { DEFAULT_ADMIN_PHONE: "12345" })).rejects.toThrow(/valid mobile number/);
      expect(await count("SELECT count(*) FROM seed_versions")).toBe(0);
    });

    it("is idempotent when the reconcile runs again", async () => {
      await database.db.transaction((tx) => reconcilePermissionCatalog(tx));
      expect(await count("SELECT count(*) FROM roles")).toBe(1);
      expect(await count("SELECT count(*) FROM role_permissions")).toBe(PERMISSION_KEYS.length);
    });
  });

  describe("Super role protection (database trigger)", () => {
    it("refuses deleting, renaming or unflagging the super Role", async () => {
      const [{ id }] = await q("SELECT id FROM roles WHERE is_super");
      expect((await rejection(database.pool.query("DELETE FROM roles WHERE id = $1", [id])))?.message).toContain("cannot be deleted");
      expect((await rejection(database.pool.query("UPDATE roles SET name = 'owner' WHERE id = $1", [id])))?.message).toContain("cannot be renamed");
      expect((await rejection(database.pool.query("UPDATE roles SET is_super = false WHERE id = $1", [id])))?.message).toContain("cannot be renamed");
      expect(await q("SELECT name, is_super FROM roles WHERE id = $1", [id])).toEqual([{ name: "super", is_super: true }]);
    });

    it("refuses reducing the super Role's Permissions, but still allows granting a new one", async () => {
      const [{ id }] = await q("SELECT id FROM roles WHERE is_super");
      expect((await rejection(database.pool.query("DELETE FROM role_permissions WHERE role_id = $1 AND permission_key = 'view-users'", [id])))?.message).toContain("cannot be removed");
      expect((await rejection(database.pool.query("UPDATE role_permissions SET permission_key = 'view-roles' WHERE role_id = $1 AND permission_key = 'view-users'", [id])))?.code).toBe("23000");
      expect(await count("SELECT count(*) FROM role_permissions WHERE role_id = $1", [id])).toBe(PERMISSION_KEYS.length);
      await q("INSERT INTO permissions (key) VALUES ('future-key')");
      await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, 'future-key')", [id]);
      expect(await count("SELECT count(*) FROM role_permissions WHERE role_id = $1", [id])).toBe(PERMISSION_KEYS.length + 1);
    });

    it("leaves every other Role free: rename, change Permissions, delete with its Permission rows", async () => {
      const [{ id }] = await q("INSERT INTO roles (name) VALUES ('Temp role') RETURNING id");
      await q("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, 'view-users'), ($1, 'view-roles')", [id]);
      await q("UPDATE roles SET name = 'Renamed role' WHERE id = $1", [id]);
      await q("DELETE FROM role_permissions WHERE role_id = $1 AND permission_key = 'view-roles'", [id]);
      await q("DELETE FROM roles WHERE id = $1", [id]);
      expect(await count("SELECT count(*) FROM role_permissions WHERE role_id = $1", [id])).toBe(0);
    });
  });
});
