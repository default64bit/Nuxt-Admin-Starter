import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "../../../server/database/schema";
import { reconcilePermissionCatalog } from "../../../server/database/seeds";

/**
 * Real-PostgreSQL harness for integration tests. `useTestDatabase()` registers the hooks that create a throwaway
 * database, apply the committed migrations, run the real Permission seed hook and drop the database again. Tests
 * call `truncate()` between cases. Nothing in it names a table, so a Project's own tables are handled as they
 * arrive and the harness is never edited.
 *
 * Suites are skipped when `TEST_DATABASE_ADMIN_URL` is unset: a role that may create and drop databases.
 */
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
export const dbSuite = adminUrl ? describe : describe.skip;

/** Drizzle keeps its bookkeeping table in the `drizzle` schema; this name guards against it ever moving to `public`. */
const MIGRATIONS_TABLE = "__drizzle_migrations";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TestDatabase {
  readonly name: string;
  /** Connection URL of the throwaway database, for a server under test. */
  readonly url: string;
  readonly pool: pg.Pool;
  readonly db: TestDb;
  /** Empties every table of the `public` schema except migrations, then runs the Permission seed hook again. */
  truncate(): Promise<void>;
  /** Drops the database now. Teardown does it too and tolerates it already being gone. */
  drop(): Promise<void>;
}

export function useTestDatabase(): TestDatabase {
  const name = `nas_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const urlFor = (database: string) => {
    // Without the variable the suites are skipped, but their bodies are still collected.
    const url = new URL(adminUrl ?? "postgres://localhost/postgres");
    url.pathname = `/${database}`;
    return url.toString();
  };
  let admin: pg.Client;
  let pool: pg.Pool;
  let db: TestDb;

  const seedPermissions = () => db.transaction((tx) => reconcilePermissionCatalog(tx));
  const drop = async () => {
    await pool?.end().catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    // A server under test is started after this hook and inherits the environment. A local `.env` (the one `just
    // first-run` creates) sets NUXT_DATABASE_URL, which beats the `databaseUrl` a suite passes in its nuxtConfig and
    // would point the server at the development database. Setting the variable first stops Nuxt loading it from `.env`.
    process.env.NUXT_DATABASE_URL = urlFor(name);
    pool = new pg.Pool({ connectionString: urlFor(name) });
    // The forced DROP DATABASE in teardown can terminate a connection that is still closing (57P01); without a
    // listener that error is unhandled and fails the whole run.
    pool.on("error", () => undefined);
    db = drizzle(pool, { schema, casing: "snake_case" });
    await migrate(db, { migrationsFolder: "server/database/migrations" });
    await seedPermissions();
  }, 60_000);

  afterAll(async () => {
    await drop();
    await admin?.end();
  }, 30_000);

  return {
    name,
    url: urlFor(name),
    get pool() {
      return pool;
    },
    get db() {
      return db;
    },
    drop,
    async truncate() {
      const { rows } = await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> $1", [MIGRATIONS_TABLE]);
      if (rows.length > 0) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          // Append-only and no-truncate triggers protect rows in production; the throwaway database is emptied
          // with triggers off for this transaction only (`replica` mode needs the superuser a test role is).
          await client.query("SET LOCAL session_replication_role = replica");
          await client.query(`TRUNCATE ${rows.map((row) => `"public"."${row.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      }
      await seedPermissions();
    },
  };
}
