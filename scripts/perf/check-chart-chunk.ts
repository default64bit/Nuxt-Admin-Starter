// The chart chunk budget (ADR-0025): chart.js, vue-chartjs and our chart helpers form one lazy chunk of at most 75 KB
// gzip that is never in the entry chunk. Run after `pnpm build` (CI runs it in `checks`):
//
//   pnpm build && pnpm perf:chart-chunk
//
// Chart.js tags its canvases, datasets and charts with `_chartjs`, which minifiers keep, so every client file that
// contains it is a chart file. Exit codes: 0 passes (also when the build has no chart file, with a note), 1 breaks the
// budget or the entry holds chart code, 2 there is no build output to check.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const CHART_CHUNK_BUDGET_BYTES = 75 * 1024;
const MARKER = "_chartjs";

export interface ChartChunkResult {
  code: 0 | 1 | 2;
  messages: string[];
}

/**
 * The files the page loads up front: the entry (the file that boots the app, named by `createApp`/`createSSRApp`, or
 * `entry.*` in a fixture) and every file it reaches through static `import ... from "./x.js"`. A dynamic `import("./x.js")` is lazy.
 */
function eagerFiles(files: string[], contents: Map<string, Buffer>): Set<string> {
  const roots = files.filter((name) => /^entry[.-]/.test(name) || /create(SSR)?App\b/.test(contents.get(name)!.toString("latin1")));
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const match of contents.get(name)!.toString("latin1").matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) if (contents.has(match[1]!)) queue.push(match[1]!);
  }
  return seen;
}

export function checkChartChunk(dir: string): ChartChunkResult {
  if (!existsSync(dir)) return { code: 2, messages: [`No build output at ${dir}; build first (pnpm build).`] };
  const files = readdirSync(dir).filter((name) => name.endsWith(".js"));
  if (files.length === 0) return { code: 2, messages: [`No client files under ${dir}; build first (pnpm build).`] };
  const contents = new Map(files.map((name) => [name, readFileSync(join(dir, name))]));
  const chartFiles = files.filter((name) => contents.get(name)!.includes(MARKER));
  if (chartFiles.length === 0) return { code: 0, messages: ["Note: no client file contains Chart.js (no chart in this build), so there is no chart chunk to check."] };

  const gzip = (name: string) => gzipSync(contents.get(name)!).length;
  const total = chartFiles.reduce((sum, name) => sum + gzip(name), 0);
  const messages = chartFiles.map((name) => `${name}: ${(contents.get(name)!.length / 1024).toFixed(1)} KB raw, ${(gzip(name) / 1024).toFixed(1)} KB gzip`);
  messages.push(`Chart files: ${chartFiles.length}, ${(total / 1024).toFixed(1)} KB gzip in total. Budget ${CHART_CHUNK_BUDGET_BYTES / 1024} KB.`);

  // A chunk that every page loads is not lazy: the entry, and everything it imports statically, must not carry Chart.js.
  const eager = [...eagerFiles(files, contents)].filter((name) => chartFiles.includes(name));
  if (eager.length > 0) return { code: 1, messages: [...messages, `Chart.js is inside the entry chunk (${eager.join(", ")}); it must load lazily.`] };
  if (chartFiles.length > 1) return { code: 1, messages: [...messages, `Chart code is split over ${chartFiles.length} files; it must be one lazy chunk.`] };
  if (total > CHART_CHUNK_BUDGET_BYTES) return { code: 1, messages: [...messages, "The chart chunk is over budget."] };
  return { code: 0, messages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkChartChunk(process.argv[2] ?? ".output/public/_nuxt");
  for (const message of result.messages) (result.code === 0 ? console.log : console.error)(message);
  process.exit(result.code);
}
