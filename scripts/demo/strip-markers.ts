// Strips marked blocks and marker-named paths from a tree. Serves `just demo-remove` (marker `demo-ticket`) and, later,
// `just first-run` (marker `starter-meta`). The marker name is a parameter; nothing here is demo-specific.
//   tsx scripts/demo/strip-markers.ts <marker> [--root <dir>] [--delete-paths]
// A block is a line holding `<marker>:start` as the first thing in a comment (`//`, `#`, `/*`, `<!--`) down to the
// line holding `<marker>:end`, both lines included. Prose that merely mentions the markers is left alone.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/** Directories never walked: dependencies, VCS and tool output. The tooling that implements the strip is skipped too. */
const SKIPPED_DIRS = new Set([".git", "node_modules", ".nuxt", ".output", ".claude", ".agents", ".data", "playwright-report", "test-results"]);
const SKIPPED_PATHS = ["scripts/demo", "tests/starter", "scripts/starter"];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function markerLine(marker: string, kind: "start" | "end"): RegExp {
  return new RegExp(`^\\s*(?:\\/\\/|#|\\/\\*+|<!--)\\s*${escapeRegExp(marker)}:${kind}(?![\\w-])`);
}

/** Removes every marked block from `text`. Throws on a nested, unclosed or unopened block. */
export function stripMarkedBlocks(text: string, marker: string, label = "text"): string {
  const start = markerLine(marker, "start");
  const end = markerLine(marker, "end");
  const kept: string[] = [];
  let openedAt = 0;
  for (const [index, line] of text.split("\n").entries()) {
    if (openedAt) {
      if (start.test(line)) throw new Error(`${label}:${index + 1}: nested ${marker}:start (block opened at line ${openedAt})`);
      if (end.test(line)) openedAt = 0;
      continue;
    }
    if (end.test(line)) throw new Error(`${label}:${index + 1}: ${marker}:end without a start`);
    if (start.test(line)) {
      openedAt = index + 1;
      continue;
    }
    kept.push(line);
  }
  if (openedAt) throw new Error(`${label}:${openedAt}: ${marker}:start without an end`);
  return kept.join("\n");
}

export type StripResult = { deletedPaths: string[]; strippedFiles: string[] };

/** Strips markers in every text file under `root`; with `deletePaths`, first deletes files and directories whose name contains `marker`. */
export function stripTree(root: string, marker: string, options: { deletePaths?: boolean; keepPaths?: string[] } = {}): StripResult {
  const result: StripResult = { deletedPaths: [], strippedFiles: [] };
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split("\\").join("/");
      if (SKIPPED_DIRS.has(name) || SKIPPED_PATHS.includes(rel)) continue;
      if (options.deletePaths && name.includes(marker) && !(options.keepPaths ?? []).some((keep) => rel === keep || rel.startsWith(`${keep}/`))) {
        rmSync(full, { recursive: true, force: true });
        result.deletedPaths.push(rel);
        continue;
      }
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const buffer = readFileSync(full);
      if (buffer.includes(0)) continue;
      const text = buffer.toString("utf8");
      if (!text.includes(`${marker}:`)) continue;
      const stripped = stripMarkedBlocks(text, marker, rel);
      if (stripped !== text) {
        writeFileSync(full, stripped);
        result.strippedFiles.push(rel);
      }
    }
  };
  if (!existsSync(root)) throw new Error(`root not found: ${root}`);
  walk(root);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const marker = args[0];
  if (!marker || marker.startsWith("--")) {
    console.error("usage: strip-markers.ts <marker> [--root <dir>] [--delete-paths]");
    process.exit(2);
  }
  const rootIndex = args.indexOf("--root");
  const root = rootIndex >= 0 ? (args[rootIndex + 1] ?? ".") : ".";
  const result = stripTree(root, marker, { deletePaths: args.includes("--delete-paths") });
  console.log(`${marker}: stripped ${result.strippedFiles.length} files, deleted ${result.deletedPaths.length} paths`);
}
