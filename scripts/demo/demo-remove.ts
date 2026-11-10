// `just demo-remove [deployed=true]`: removes the Reference module (the demo ticket domain) from a Project.
//   default        the demo migration is dropped (nothing is deployed yet), then run `just dev-reset`
//   deployed=true  the demo migration stays; a normal migration that drops the demo tables is generated for review
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { stripTree } from "./strip-markers.ts";

export const DEMO_MARKER = "demo-ticket";
const DROP_MIGRATION_NAME = "drop-demo-tickets";
const migrationsRel = "server/database/migrations";

type Journal = { entries: { idx: number; tag: string }[] } & Record<string, unknown>;

/**
 * Removes the demo migration the way `drizzle-kit drop` does for the picked entry: its SQL file, its snapshot and its
 * journal entry. `drizzle-kit drop` itself only works interactively, so the recipe applies the same three changes directly.
 */
export function dropDemoMigration(migrationsDir: string): string[] {
  const journalPath = join(migrationsDir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
  const dropped = journal.entries.filter((entry) => entry.tag.includes(DEMO_MARKER));
  if (!dropped.length) return [];
  const last = journal.entries.at(-1);
  if (last && !last.tag.includes(DEMO_MARKER)) {
    throw new Error(`The demo migration is not the latest one (${last.tag}); drop it by hand or use deployed=true.`);
  }
  for (const entry of dropped) {
    rmSync(join(migrationsDir, "meta", `${entry.tag.slice(0, 4)}_snapshot.json`), { force: true });
    rmSync(join(migrationsDir, `${entry.tag}.sql`), { force: true });
  }
  journal.entries = journal.entries.filter((entry) => !entry.tag.includes(DEMO_MARKER));
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  return dropped.map((entry) => entry.tag);
}

export type DemoRemoveOptions = {
  root: string;
  deployed: boolean;
  /** Generates the drop migration; injectable for tests. */
  generateMigration?: (root: string) => void;
};

export function demoRemove({ root, deployed, generateMigration = defaultGenerate }: DemoRemoveOptions): string[] {
  const migrationsDir = join(root, "server", "database", "migrations");
  const messages: string[] = [];
  // Migrations first: the strip deletes the demo migration file by name and would leave the journal pointing at it.
  if (!deployed && existsSync(migrationsDir)) {
    for (const tag of dropDemoMigration(migrationsDir)) messages.push(`Dropped migration ${tag}.`);
  }
  // Deployed: the demo migration stays on disk and in the journal, so it must survive the path deletion.
  const result = stripTree(root, DEMO_MARKER, { deletePaths: true, keepPaths: deployed ? [migrationsRel] : [] });
  messages.push(`Deleted ${result.deletedPaths.length} demo paths and stripped ${result.strippedFiles.length} files.`);
  if (deployed) {
    generateMigration(root);
    messages.push(`Generated a migration that drops the demo tables. Inspect the SQL in ${migrationsDir} before committing it.`);
  } else {
    messages.push("Run `just dev-reset` to throw away the local database, then `just db-prepare`.");
  }
  return messages;
}



function defaultGenerate(root: string): void {
  // drizzle-kit only reads the schema here; the URL just satisfies drizzle.config.ts.
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgres://generate:generate@localhost:5432/generate" };
  execFileSync("pnpm", ["exec", "drizzle-kit", "generate", "--name", DROP_MIGRATION_NAME], { cwd: root, env, stdio: "inherit" });
  const created = readdirSync(join(root, "server", "database", "migrations")).some((name) => name.endsWith(`${DROP_MIGRATION_NAME}.sql`));
  if (!created) console.warn("drizzle-kit reported no schema change; no drop migration was written.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "deployed=true" && arg !== "deployed=false");
  if (unknown.length) {
    console.error(`usage: just demo-remove [deployed=true]  (unknown: ${unknown.join(" ")})`);
    process.exit(2);
  }
  for (const message of demoRemove({ root: process.cwd(), deployed: args.includes("deployed=true") })) console.log(message);
}
