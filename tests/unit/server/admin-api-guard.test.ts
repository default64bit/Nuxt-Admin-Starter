// @vitest-environment node
import { createApp, eventHandler, toWebHandler, type H3Event } from "h3";
import { describe, expect, it } from "vitest";
import apiErrorHandler from "../../../server/error-handler";
import { assertPermissionPrerequisites } from "../../../server/services/authorization";
import type { ResolvedSession } from "../../../server/services/session.service";
import { resolveAuthSession } from "../../../server/utils/auth-session";
import { requireAllPermissions, requireAnyPermission, requirePermission } from "../../../server/utils/require-auth";

const session = (over: Partial<ResolvedSession> = {}): ResolvedSession => ({
  sessionId: "s",
  userId: "u",
  isSuper: false,
  permissions: ["view-users"],
  givenName: null,
  familyName: null,
  ...over,
});

// Test-only routes standing in for guarded handlers: the faked session is the seam until sign-in lands. The route
// proof against a real signed-in session arrives with the authentication slice.
function app(resolved: ResolvedSession | null) {
  const resolve = async (_event: H3Event) => resolved;
  const handler = createApp({ onError: async (error, event) => void (await apiErrorHandler(error, event)) });
  handler.use(
    "/api/v1/users",
    eventHandler(async (event) => ({ actor: (await requirePermission(event, "view-users", resolve)).userId })),
  );
  handler.use(
    "/api/v1/any",
    eventHandler(async (event) => ({ actor: (await requireAnyPermission(event, ["view-roles", "view-users"], resolve)).userId })),
  );
  handler.use(
    "/api/v1/all",
    eventHandler(async (event) => ({ actor: (await requireAllPermissions(event, ["create-users", "manage-roles"], resolve)).userId })),
  );
  handler.use(
    "/api/v1/roles",
    eventHandler(() => {
      assertPermissionPrerequisites(["manage-roles"]);
      return {};
    }),
  );
  const web = toWebHandler(handler);
  return (path: string) => web(new Request(`http://x/api/v1/${path}`));
}

describe("authorization gate (test-only routes)", () => {
  it("answers 401 unauthenticated, with the standard body and no data, for a guest", async () => {
    const res = await app(null)("users");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ statusCode: 401, data: { code: "unauthenticated" } });
  });

  it("answers 401 for a real request today: no sign-in exists yet, so every caller is a guest", async () => {
    const web = toWebHandler(
      createApp({ onError: async (error, event) => void (await apiErrorHandler(error, event)) }).use(
        "/api/v1/users",
        eventHandler(async (event) => requirePermission(event, "view-users", resolveAuthSession)),
      ),
    );
    expect((await web(new Request("http://x/api/v1/users"))).status).toBe(401);
  });

  it("answers 403 forbidden to a signed-in User lacking the Permission, never a 404", async () => {
    const res = await app(session({ permissions: ["view-roles"] }))("users");
    expect(res.status).toBe(403);
    expect((await res.json()).data.code).toBe("forbidden");
  });

  it("lets a User with the Permission through", async () => {
    const res = await app(session())("users");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ actor: "u" });
  });

  it("requireAnyPermission needs one key, requireAllPermissions needs every key", async () => {
    expect((await app(session({ permissions: ["view-roles"] }))("any")).status).toBe(200);
    expect((await app(session({ permissions: ["view-audit-log"] }))("any")).status).toBe(403);
    expect((await app(session({ permissions: ["create-users"] }))("all")).status).toBe(403);
    expect((await app(session({ permissions: ["create-users", "manage-roles"] }))("all")).status).toBe(200);
  });

  it("answers 422 permission_prerequisites for a set that breaks a prerequisite", async () => {
    const res = await app(session())("roles");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ statusCode: 422, data: { code: "permission_prerequisites", missing: [{ key: "manage-roles", needs: "view-roles" }] } });
    expect(() => assertPermissionPrerequisites(["manage-roles", "view-roles"])).not.toThrow();
  });
});
