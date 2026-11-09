// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERMISSION_GROUP_IDS,
  PERMISSION_GROUP_OF,
  PERMISSION_GROUPS,
  PERMISSION_PREREQUISITES,
  permissionGroupHintKey,
  permissionGroupLabelKey,
  permissionHintKey,
  permissionLabelKey,
} from "~~/shared/constants/permission-catalog";
import { PERMISSION_KEYS, type PermissionKey } from "~~/shared/constants/permissions";
import { allowGroup, clearGroup, missingPrerequisites, neededBy, prerequisiteClosure, withPrerequisites } from "~~/shared/utils/permission-prerequisites";

const root = join(__dirname, "../../..");
const locale = (name: string) => JSON.parse(readFileSync(join(root, "i18n/locales", `${name}.json`), "utf8")) as Record<string, unknown>;
const lookup = (tree: Record<string, unknown>, key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
const keys = (...list: PermissionKey[]) => new Set(list);
const sorted = (list: Iterable<string>) => [...list].sort();

// The completeness contract: a Permission is never half-added. Adding a key to PERMISSION_KEYS fails these tests
// until it also has a group, a prerequisite entry and an fa/en label and hint.
describe("Permission catalogue completeness", () => {
  it("has 7 core keys in 3 groups, each key in exactly one group", () => {
    expect(PERMISSION_KEYS).toHaveLength(7);
    expect(sorted(PERMISSION_GROUP_IDS)).toEqual(["audit", "roles", "users"]);
    expect(PERMISSION_GROUPS.map((group) => group.id)).toEqual([...PERMISSION_GROUP_IDS]);
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.keys);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(sorted(grouped)).toEqual(sorted(PERMISSION_KEYS));
    for (const key of PERMISSION_KEYS) expect(PERMISSION_GROUP_OF[key], `${key} has no group`).toBeDefined();
  });

  it("makes a prerequisite decision for every key, with real keys and no cycle", () => {
    expect(sorted(Object.keys(PERMISSION_PREREQUISITES))).toEqual(sorted(PERMISSION_KEYS));
    for (const key of PERMISSION_KEYS) {
      for (const needed of PERMISSION_PREREQUISITES[key]) expect(PERMISSION_KEYS, `${key} needs an unknown key ${needed}`).toContain(needed);
      expect(prerequisiteClosure(key), `${key} is its own prerequisite`).not.toContain(key);
    }
  });

  for (const name of ["en", "fa"]) {
    it(`has a label and a hint in ${name} for every key and group, and nothing else`, () => {
      const tree = locale(name);
      const messages = [...PERMISSION_KEYS.flatMap((key) => [permissionLabelKey(key), permissionHintKey(key)]), ...PERMISSION_GROUP_IDS.flatMap((id) => [permissionGroupLabelKey(id), permissionGroupHintKey(id)])];
      for (const message of messages) expect(lookup(tree, message), `${name} ${message}`).toEqual(expect.stringMatching(/\S/));
      const permissions = lookup(tree, "admin.permissions") as { groups: Record<string, unknown>; keys: Record<string, unknown> };
      expect(Object.keys(permissions.keys)).toHaveLength(PERMISSION_KEYS.length);
      expect(sorted(Object.keys(permissions.groups))).toEqual(sorted(PERMISSION_GROUP_IDS));
      for (const key of PERMISSION_KEYS) expect(lookup(tree, permissionLabelKey(key))).not.toBe(key);
    });
  }
});

describe("Permission prerequisites", () => {
  it("matches the accepted map: user actions need view-users, manage-roles needs view-roles", () => {
    for (const key of ["create-users", "edit-users", "disable-users"] as const) expect(PERMISSION_PREREQUISITES[key]).toEqual(["view-users"]);
    expect(PERMISSION_PREREQUISITES["manage-roles"]).toEqual(["view-roles"]);
    for (const key of ["view-users", "view-roles", "view-audit-log"] as const) expect(PERMISSION_PREREQUISITES[key]).toEqual([]);
  });

  it("adds prerequisites to a selection, names what needs a key, and reports what a Role lacks", () => {
    expect(sorted(withPrerequisites(keys("manage-roles")))).toEqual(["manage-roles", "view-roles"]);
    expect(neededBy("view-users", keys("view-users", "edit-users", "view-audit-log"))).toEqual(["edit-users"]);
    expect(missingPrerequisites(keys("edit-users", "manage-roles"))).toEqual([
      { key: "edit-users", needs: "view-users" },
      { key: "manage-roles", needs: "view-roles" },
    ]);
    expect(missingPrerequisites(PERMISSION_KEYS)).toEqual([]);
  });

  it("allows and clears a group, keeping what another group still needs", () => {
    expect(sorted(allowGroup([], "roles"))).toEqual(["manage-roles", "view-roles"]);
    expect(sorted(clearGroup(keys("view-users", "edit-users", "view-audit-log"), "users"))).toEqual(["view-audit-log"]);
  });
});
