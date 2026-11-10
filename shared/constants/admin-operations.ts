// The operations an admin can attempt (.specs/audit-log/spec.md "Refused attempts are recorded safely"): a static table
// keyed by `METHOD <pattern under /api/v1/admin/>` that says which audit action, entity type and id a refused attempt is
// recorded under. The action is never derived from the URL text or the body. `idParam` names the route parameter
// holding the entity id (recorded only when it is a well-formed uuid). A mutating admin route missing here is a
// Project's omission: add its row when you add the route (a unit test lists the mutating handlers).
export interface AdminOperation {
  action: string;
  entityType: string;
  idParam?: string;
}

const op = (action: string, entityType: string, idParam?: string): AdminOperation => (idParam === undefined ? { action, entityType } : { action, entityType, idParam });

export const ADMIN_API_PREFIX = "/api/v1/admin/";

export const ADMIN_OPERATIONS: Record<string, AdminOperation> = {
  "PATCH account": op("account.update", "user"),
  "POST account/phone-change/request": op("account.change_phone", "user"),
  "POST account/phone-change/verify": op("account.change_phone", "user"),
  "POST roles": op("role.create", "role"),
  "PUT roles/:id": op("role.update", "role", "id"),
  "DELETE roles/:id": op("role.delete", "role", "id"),
  "POST users": op("user.create", "user"),
  "PATCH users/:id": op("user.update", "user", "id"),
  "PUT users/:id/roles": op("user.roles", "user", "id"),
  "POST users/:id/disable": op("user.disable", "user", "id"),
  "POST users/:id/enable": op("user.enable", "user", "id"),
  // demo-ticket:start
  "POST demo-tickets": op("demo_ticket.created", "demo_ticket"),
  "PATCH demo-tickets/:id": op("demo_ticket.updated", "demo_ticket", "id"),
  "DELETE demo-tickets/:id": op("demo_ticket.deleted", "demo_ticket", "id"),
  // demo-ticket:end
};

// The signed-in User's own display preferences (Dashboard layout, ranges, Chart style). They need no Permission, so they
// are never refused, and they are not audited. Mutating admin routes listed here need no ADMIN_OPERATIONS row.
export const ADMIN_PREFERENCE_ROUTES: readonly string[] = [
  "PUT account/dashboard/arrangement",
  "DELETE account/dashboard/arrangement",
  "PUT account/dashboard/chart-style",
  "PUT account/dashboard/ranges/:moduleKey",
];

export interface MatchedOperation {
  operation: AdminOperation;
  /** The registry pattern, never the concrete URL (`/api/v1/admin/users/:id/disable`). */
  route: string;
  params: Record<string, string>;
}

const compiled = Object.entries(ADMIN_OPERATIONS).map(([key, operation]) => {
  const [method, pattern] = key.split(" ") as [string, string];
  return { method, route: `${ADMIN_API_PREFIX}${pattern}`, segments: pattern.split("/"), operation };
});

/** The operation a request is attempting, or null for a route the registry does not know. Static segments win over parameters. */
export function findAdminOperation(method: string, path: string): MatchedOperation | null {
  if (!path.startsWith(ADMIN_API_PREFIX)) return null;
  const parts = path.slice(ADMIN_API_PREFIX.length).replace(/\/+$/, "").split("/");
  let best: (MatchedOperation & { paramCount: number }) | null = null;
  for (const entry of compiled) {
    if (entry.method !== method.toUpperCase() || entry.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let paramCount = 0;
    const ok = entry.segments.every((segment, index) => {
      if (!segment.startsWith(":")) return segment === parts[index];
      params[segment.slice(1)] = parts[index]!;
      paramCount++;
      return true;
    });
    if (ok && (!best || paramCount < best.paramCount)) best = { operation: entry.operation, route: entry.route, params, paramCount };
  }
  return best ? { operation: best.operation, route: best.route, params: best.params } : null;
}
