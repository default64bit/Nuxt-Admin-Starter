// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { checkChartChunk } from "../../../scripts/perf/check-chart-chunk";

// The chart chunk check on fixture build outputs (ADR-0025): one lazy chunk under 75 KB gzip, never in the entry.
const dirs: string[] = [];
function build(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), "chart-chunk-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("the chart chunk check", () => {
  it("exits 2 when there is no build output", () => {
    expect(checkChartChunk(join(tmpdir(), "chart-chunk-missing")).code).toBe(2);
    const empty = join(mkdtempSync(join(tmpdir(), "chart-chunk-")));
    dirs.push(empty);
    mkdirSync(join(empty, "x"));
    expect(checkChartChunk(empty).code).toBe(2);
  });

  it("passes with a note when the build has no chart chunk", () => {
    const result = checkChartChunk(build({ "entry.abc.js": "console.log(1)", "page.js": "x" }));
    expect(result.code).toBe(0);
    expect(result.messages[0]).toMatch(/no chart/i);
  });

  it("passes one small lazy chart chunk", () => {
    expect(checkChartChunk(build({ "entry.abc.js": "x", "chart.def.js": "const a = '_chartjs'" })).code).toBe(0);
  });

  it("fails a chunk over 75 KB gzip, chart code in the entry, and chart code split over files", () => {
    const heavy = `_chartjs${randomBytes(90 * 1024).toString("base64")}`;
    expect(checkChartChunk(build({ "chart.def.js": heavy })).code).toBe(1);
    expect(checkChartChunk(build({ "entry.abc.js": "_chartjs" })).code).toBe(1);
    expect(checkChartChunk(build({ "boot.js": 'createApp();import{a}from"./chart.js";', "chart.js": "_chartjs" })).code).toBe(1);
    expect(checkChartChunk(build({ "boot.js": 'createApp();import("./chart.js");', "chart.js": "_chartjs" })).code).toBe(0);
    expect(checkChartChunk(build({ "a.js": "_chartjs", "b.js": "_chartjs" })).code).toBe(1);
  });
});
