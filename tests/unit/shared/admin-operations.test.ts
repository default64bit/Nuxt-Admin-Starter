import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_OPERATIONS, findAdminOperation } from "../../../shared/constants/admin-operations";
import { AUDIT_ACTIONS } from "../../../shared/constants/audit-actions";

const ROOT = join(__dirname, "../../../server/api/v1/admin");
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

describe("admin operations registry", () => {
  it("has a row for every mutating admin route, and every row names a known audit action", () => {
    const mutating = walk(ROOT)
      .map((file) => file.slice(ROOT.length + 1).replace(/\\/g, "/"))
      .map((file) => /^(.*)\.(post|put|patch|delete)\.ts$/.exec(file))
      .filter((match): match is RegExpExecArray => match !== null)
      .map(([, route, method]) => `${method!.toUpperCase()} ${route!.replace(/\[(\w+)\]/g, ":$1").replace(/\/index$/, "").replace(/^index$/, "")}`);
    expect(mutating.length).toBeGreaterThan(0);
    expect(mutating.filter((key) => !(key in ADMIN_OPERATIONS))).toEqual([]);
    for (const operation of Object.values(ADMIN_OPERATIONS)) expect(Object.keys(AUDIT_ACTIONS)).toContain(operation.action);
  });

  it("matches a concrete path to its pattern", () => {
    const id = "0190b6f0-0000-7000-8000-000000000000";
    expect(findAdminOperation("POST", `/api/v1/admin/users/${id}/disable`)).toMatchObject({ route: "/api/v1/admin/users/:id/disable", params: { id } });
    expect(findAdminOperation("GET", "/api/v1/admin/users")).toBeNull();
  });
});
