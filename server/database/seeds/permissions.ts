import type { Tx } from "../types";

/**
 * The Permission catalogue reconcile: runs on every seed run and in the test database harness. Add-only: it
 * inserts the keys that are missing, creates the `super` Role and grants it every key, and never removes a key or
 * any assignment made in the panel.
 *
 * The catalogue and the accounts tables arrive with the accounts and authorization slice, which fills this in.
 * Until then there is nothing to reconcile.
 */
export async function reconcilePermissionCatalog(tx: Tx): Promise<void> {
  void tx;
}
