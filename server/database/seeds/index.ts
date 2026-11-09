import { eq, sql } from "drizzle-orm";
import * as schema from "../schema";
import type { Db, Tx } from "../types";
import { reconcilePermissionCatalog } from "./permissions";

export { reconcilePermissionCatalog };

/** Environment settings a seed version may read (the Default admin arrives with the accounts slice). */
export interface SeedEnv {
  DEFAULT_ADMIN_PHONE?: string;
  DEFAULT_ADMIN_GIVEN_NAME?: string;
  DEFAULT_ADMIN_FAMILY_NAME?: string;
}

export interface SeedReport {
  applied: string[];
  skipped: string[];
  warnings: string[];
}

export interface VersionedSeed {
  version: string;
  /** Returns false (and is not recorded) when it cannot complete yet, so a later run can retry it. */
  run: (tx: Tx, ctx: { env: SeedEnv; report: SeedReport }) => Promise<boolean>;
}

// Append a version here to add immutable system data or the Default admin. A completed version is never
// re-run, so what it created can be changed in the panel without a later deploy undoing it.
const VERSIONED_SEEDS: VersionedSeed[] = [];

/**
 * Reconciles the Permission catalogue and applies every seed version that has not completed yet. Each run is one
 * transaction and idempotent.
 */
export async function runSeeds(db: Db, env: SeedEnv, seeds: VersionedSeed[] = VERSIONED_SEEDS): Promise<SeedReport> {
  const report: SeedReport = { applied: [], skipped: [], warnings: [] };
  // Serialize concurrent seed runs (e.g. two deploys) on a transaction-scoped advisory lock.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('nuxt-admin-starter-seed'))`);
    await reconcilePermissionCatalog(tx);
    for (const seed of seeds) {
      const [done] = await tx.select().from(schema.seedVersions).where(eq(schema.seedVersions.version, seed.version));
      if (done) {
        report.skipped.push(seed.version);
        continue;
      }
      if (await seed.run(tx, { env, report })) {
        await tx.insert(schema.seedVersions).values({ version: seed.version });
        report.applied.push(seed.version);
      }
    }
  });
  return report;
}
