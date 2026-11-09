// @vitest-environment node
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// Every array a request can carry is length-capped: a schema exported from `shared/schemas` fails here when it
// holds a `z.array` without `.max()`/`.length()`, unless it is listed below.

/** Response schemas: they parse what the server built, never client input. Add `<file>:<exportName>`. */
const RESPONSE_SCHEMAS = new Set<string>([]);

/** Request schemas left uncapped on purpose, with the reason. */
const UNCAPPED_REQUESTS = new Set<string>([]);

const schemaDir = join(__dirname, "../../../shared/schemas");

type Def = z.core.$ZodTypeDef & Record<string, unknown>;
const isSchema = (value: unknown): value is z.core.$ZodType => typeof value === "object" && value !== null && "_zod" in value;

function children(def: Def): unknown[] {
  const direct = ["innerType", "in", "out", "element", "keyType", "valueType", "left", "right", "catchall"].map((key) => def[key]);
  const shape = def.shape ? Object.values(def.shape as Record<string, unknown>) : [];
  const many = [def.options, def.items].flatMap((list) => (Array.isArray(list) ? list : []));
  return [...direct, ...shape, ...many];
}

/** Whether the schema (or anything nested in it) holds an array without a maximum length. */
function hasUncappedArray(schema: z.core.$ZodType, seen = new Set<z.core.$ZodType>()): boolean {
  if (seen.has(schema)) return false;
  seen.add(schema);
  const def = schema._zod.def as Def;
  const capped = (def.checks ?? []).some((check) => ["max_length", "length_equals"].includes(check._zod.def.check));
  if (def.type === "array" && !capped) return true;
  return children(def).some((child) => isSchema(child) && hasUncappedArray(child, seen));
}

async function exportedSchemas(): Promise<Map<string, z.core.$ZodType>> {
  const schemas = new Map<string, z.core.$ZodType>();
  for (const file of readdirSync(schemaDir).filter((name) => name.endsWith(".ts"))) {
    const module: Record<string, unknown> = await import(join(schemaDir, file));
    for (const [name, value] of Object.entries(module)) if (isSchema(value)) schemas.set(`${file.slice(0, -3)}:${name}`, value);
  }
  return schemas;
}

describe("request array caps", () => {
  it("caps every array of a request schema", async () => {
    const uncapped = [...(await exportedSchemas())].filter(([key, schema]) => !RESPONSE_SCHEMAS.has(key) && !UNCAPPED_REQUESTS.has(key) && hasUncappedArray(schema)).map(([key]) => key);
    expect(uncapped).toEqual([]);
  });

  it("lists only exported schemas that still hold an uncapped array", async () => {
    const schemas = await exportedSchemas();
    const stale = [...RESPONSE_SCHEMAS, ...UNCAPPED_REQUESTS].filter((key) => !schemas.has(key) || !hasUncappedArray(schemas.get(key)!));
    expect(stale).toEqual([]);
  });

  it("sees an array nested in a refined, optional or piped field", () => {
    expect(hasUncappedArray(z.object({ ids: z.array(z.string()).optional() }).refine(() => true))).toBe(true);
    expect(hasUncappedArray(z.object({ ids: z.string().transform((v) => v.split(",")).pipe(z.array(z.string())) }))).toBe(true);
    expect(hasUncappedArray(z.object({ ids: z.array(z.string()).max(5).default([]) }))).toBe(false);
  });
});
