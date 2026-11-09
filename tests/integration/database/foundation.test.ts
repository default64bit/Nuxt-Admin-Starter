// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { runSeeds, type VersionedSeed } from "../../../server/database/seeds";
import * as schema from "../../../server/database/schema";
import { dbSuite, useTestDatabase } from "../support/database";

const count = async (pool: { query: (sql: string) => Promise<{ rows: Array<{ count: string }> }> }, table: string) =>
  Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0]!.count);

dbSuite("database foundation", () => {
  const database = useTestDatabase();

  beforeEach(() => database.truncate());

  it("applies the committed baseline migration", async () => {
    const tables = await database.pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    expect(tables.rows.map((row) => row.tablename)).toContain("seed_versions");
    expect(await count(database.pool, "drizzle.__drizzle_migrations")).toBeGreaterThan(0);
  });

  it("truncates every schema table except migrations, even with an append-only guard and foreign keys", async () => {
    await database.pool.query(`
      CREATE TABLE harness_parent (id int PRIMARY KEY);
      CREATE TABLE harness_child (id int PRIMARY KEY, parent_id int NOT NULL REFERENCES harness_parent (id));
      CREATE FUNCTION harness_refuse() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only'; END $$;
      CREATE TRIGGER harness_no_truncate BEFORE TRUNCATE ON harness_child FOR EACH STATEMENT EXECUTE FUNCTION harness_refuse();
      INSERT INTO harness_parent VALUES (1);
      INSERT INTO harness_child VALUES (1, 1);
      INSERT INTO seed_versions (version) VALUES ('probe');
    `);
    const migrations = await count(database.pool, "drizzle.__drizzle_migrations");

    await database.truncate();

    for (const table of ["harness_parent", "harness_child", "seed_versions"]) expect(await count(database.pool, table), table).toBe(0);
    expect(await count(database.pool, "drizzle.__drizzle_migrations")).toBe(migrations);
    await database.pool.query("DROP TABLE harness_child, harness_parent; DROP FUNCTION harness_refuse()");
  });

  describe("seed runner", () => {
    const version = (name: string, outcome: boolean): VersionedSeed => ({ version: name, run: async () => outcome });

    it("applies a version once and skips it on the next run", async () => {
      const seeds = [version("001-first", true)];
      expect((await runSeeds(database.db, {}, seeds)).applied).toEqual(["001-first"]);
      const again = await runSeeds(database.db, {}, seeds);
      expect(again.applied).toEqual([]);
      expect(again.skipped).toEqual(["001-first"]);
      expect(await database.db.select().from(schema.seedVersions)).toHaveLength(1);
    });

    it("does not record a version that could not complete, so a later run retries it", async () => {
      expect((await runSeeds(database.db, {}, [version("002-later", false)])).applied).toEqual([]);
      expect(await count(database.pool, "seed_versions")).toBe(0);
      expect((await runSeeds(database.db, {}, [version("002-later", true)])).applied).toEqual(["002-later"]);
    });

    it("runs the production seed list without error on an empty database", async () => {
      const report = await runSeeds(database.db, {});
      expect(report).toMatchObject({ applied: [], skipped: [] });
      expect(report.warnings).toHaveLength(1); // no Default admin phone: warn and retry next run
    });
  });
});
