// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");
const load = (name: string) =>
  JSON.parse(readFileSync(join(root, "i18n/locales", `${name}.json`), "utf8")) as Record<string, unknown>;

function flatten(tree: Record<string, unknown>, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(path, value);
    else if (value && typeof value === "object") {
      for (const [nested, text] of flatten(value as Record<string, unknown>, path)) result.set(nested, text);
    } else throw new Error(`${path} must be a string or an object`);
  }
  return result;
}

const en = flatten(load("en"));
const fa = flatten(load("fa"));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    // `ui` is generated primitives; `panel` is the legacy scaffold the admin-shell effort deletes.
    if (statSync(full).isDirectory()) return entry === "ui" || entry === "panel" ? [] : sourceFiles(full);
    return /\.(vue|ts)$/.test(entry) ? [full] : [];
  });
}

describe("message files", () => {
  it("contain exactly the same keys in en and fa", () => {
    expect([...fa.keys()].sort()).toEqual([...en.keys()].sort());
  });

  it("have no empty values", () => {
    for (const [name, messages] of [["en", en], ["fa", fa]] as const) {
      for (const [key, text] of messages) expect(text.trim(), `${name}:${key}`).not.toBe("");
    }
  });

  it("follow the lowerCamel dot-path key convention", () => {
    for (const key of en.keys()) expect(key).toMatch(/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/);
  });

  it("keep the same interpolation tokens in both languages", () => {
    const tokens = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, text] of en) expect(tokens(fa.get(key) ?? ""), key).toEqual(tokens(text));
  });

  it("define every literal key used in app code", () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(root, "app"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?<![\w.])\$?t\(\s*['"]([A-Za-z][\w.]*)['"]/g)) used.add(match[1]!);
    }
    for (const key of used) {
      expect(en.has(key), `en is missing ${key}`).toBe(true);
      expect(fa.has(key), `fa is missing ${key}`).toBe(true);
    }
  });
});
