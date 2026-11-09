import { PERMISSION_GROUPS, PERMISSION_PREREQUISITES, type PermissionGroupId } from "../constants/permission-catalog";
import type { PermissionKey } from "../constants/permissions";

// Helpers over the prerequisite map, shared by the role editor (what ticking a key also ticks, what
// blocks unticking) and the server (what a saved Role is missing).

/** Everything a key needs, directly or through other keys, without the key itself. */
export function prerequisiteClosure(key: PermissionKey): PermissionKey[] {
  const seen = new Set<PermissionKey>();
  const visit = (current: PermissionKey) => {
    for (const needed of PERMISSION_PREREQUISITES[current]) {
      if (needed === key || seen.has(needed)) continue;
      seen.add(needed);
      visit(needed);
    }
  };
  visit(key);
  return [...seen];
}

/** The selection with every prerequisite of every selected key added (what ticking a key also ticks). */
export function withPrerequisites(selected: Iterable<PermissionKey>): Set<PermissionKey> {
  const result = new Set(selected);
  for (const key of [...result]) for (const needed of prerequisiteClosure(key)) result.add(needed);
  return result;
}

/**
 * The selected keys, other than `key`, that need it (directly or through other keys): while any is
 * selected, `key` cannot be unticked.
 */
export function neededBy(key: PermissionKey, selected: Iterable<PermissionKey>): PermissionKey[] {
  return [...new Set(selected)].filter((other) => other !== key && prerequisiteClosure(other).includes(key));
}

/** What a saved Role lacks: each held key with each direct prerequisite it does not hold. Empty when the Role is complete. */
export function missingPrerequisites(selected: Iterable<PermissionKey>): { key: PermissionKey; needs: PermissionKey }[] {
  const held = new Set(selected);
  return [...held].flatMap((key) => PERMISSION_PREREQUISITES[key].filter((needs) => !held.has(needs)).map((needs) => ({ key, needs })));
}

const keysOf = (id: PermissionGroupId): readonly PermissionKey[] => PERMISSION_GROUPS.find((group) => group.id === id)?.keys ?? [];

/** "Allow all in group": the selection plus every key of the group and what those keys need (possibly in another group). */
export function allowGroup(selected: Iterable<PermissionKey>, id: PermissionGroupId): Set<PermissionKey> {
  return withPrerequisites([...selected, ...keysOf(id)]);
}

/** "Clear group": removes the group's keys, but keeps any that a key outside the group still needs. */
export function clearGroup(selected: Iterable<PermissionKey>, id: PermissionGroupId): Set<PermissionKey> {
  const group = new Set(keysOf(id));
  const current = new Set(selected);
  const outside = [...current].filter((key) => !group.has(key));
  const needed = new Set(outside.flatMap((key) => prerequisiteClosure(key)));
  return new Set([...current].filter((key) => !group.has(key) || needed.has(key)));
}
