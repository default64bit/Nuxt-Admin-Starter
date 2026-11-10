// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");
const adminApi = join(root, "server/api/v1/admin");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// `requireSignedIn` guards a User's own state (inbox, settings, My account), which carries no Permission key.
const GUARD = /require(SignedIn|Permission|AnyPermission|AllPermissions)\(/;

// Admin API paths are intentionally not hidden: every handler must answer 401/403 itself.
describe("admin API guard (admin shell spec)", () => {
  it("calls a guard first in every handler under server/api/v1/admin", () => {
    const unguarded = walk(adminApi)
      .filter((file) => /\.(get|post|put|patch|delete)\.ts$/.test(file))
      .filter((file) => !GUARD.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));
    expect(unguarded).toEqual([]);
  });

  it("detects an unguarded handler (negative control) and accepts each guard", () => {
    expect(GUARD.test("export default defineEventHandler(() => ({}))")).toBe(false);
    expect(GUARD.test('await requirePermission(event, "view-users")')).toBe(true);
    expect(GUARD.test('await requireAnyPermission(event, ["view-roles", "view-users"])')).toBe(true);
    expect(GUARD.test('await requireAllPermissions(event, ["create-users", "manage-roles"])')).toBe(true);
    expect(GUARD.test("await requireSignedIn(event)")).toBe(true);
  });
});
