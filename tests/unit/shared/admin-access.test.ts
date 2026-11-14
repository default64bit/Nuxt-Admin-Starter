// @vitest-environment node
import { describe, expect, it } from "vitest";
import { adminRouteAccess } from "~~/shared/utils/admin-access";

describe("adminRouteAccess (route middleware decision)", () => {
  const user = { loggedIn: true, user: { givenName: null, familyName: null, permissions: ["view-users"] } };

  it("allows a signed-in User on the Dashboard (no Permission needed)", () => {
    expect(adminRouteAccess(user, undefined)).toBe("allow");
  });

  it("allows a User holding the page Permission and answers forbidden for one without it", () => {
    expect(adminRouteAccess(user, "view-users")).toBe("allow");
    expect(adminRouteAccess(user, "view-roles")).toBe("forbidden");
  });

  it.each([
    ["guest", { loggedIn: false }],
    ["missing payload", undefined],
  ])("sends a %s to sign-in", (_name, session) => {
    expect(adminRouteAccess(session, undefined)).toBe("sign-in");
    expect(adminRouteAccess(session, "view-users")).toBe("sign-in");
  });
});
