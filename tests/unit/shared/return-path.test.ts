// @vitest-environment node
import { describe, expect, it } from "vitest";
import { privateRouteRedirect, sanitizeReturnPath } from "~~/shared/utils/return-path";

describe("sanitizeReturnPath", () => {
  it.each(["/admin", "/admin/users", "/admin/users?page=2", "/en/admin/roles", "/en/admin/audit/", "/admin#top", "/"])("keeps the safe path %s", (path) => {
    expect(sanitizeReturnPath(path)).toBe(path);
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "/\\evil",
    "evil",
    "",
    "/sign-in",
    "/en/sign-in",
    "/sign-in?redirect=/x",
    "/admin\n/x",
    "/a\u0000b",
    "/%2F%2Fevil.example",
  ])("falls back for %j", (path) => {
    expect(sanitizeReturnPath(path)).toBe("/");
  });

  it("falls back for non-strings and arrays, and uses a given fallback", () => {
    for (const value of [undefined, null, ["/a", "/b"]]) expect(sanitizeReturnPath(value)).toBe("/");
    expect(sanitizeReturnPath("//x", "/en")).toBe("/en");
  });
});

describe("privateRouteRedirect", () => {
  const guest = (path: string, search = "", sessionEnded = false) => privateRouteRedirect({ path, search, redirect: undefined, signedIn: false, sessionEnded });

  it("sends a guest from any admin page to sign-in, keeping the locale, the path and the query", () => {
    expect(guest("/admin")).toBe("/sign-in?redirect=%2Fadmin");
    expect(guest("/admin/users", "?page=2")).toBe(`/sign-in?redirect=${encodeURIComponent("/admin/users?page=2")}`);
    expect(guest("/en/admin/roles")).toBe(`/en/sign-in?redirect=${encodeURIComponent("/en/admin/roles")}`);
  });

  it("says the session ended when the request carried one that no longer holds", () => {
    expect(guest("/admin", "", true)).toBe("/sign-in?redirect=%2Fadmin&reason=session-ended");
  });

  it("never guards the landing page, in either locale", () => {
    for (const path of ["/", "/en"]) expect(guest(path)).toBeNull();
  });

  it("leaves a signed-in visitor on admin pages alone", () => {
    expect(privateRouteRedirect({ path: "/admin", search: "", redirect: undefined, signedIn: true })).toBeNull();
  });

  it("sends a signed-in visitor on sign-in to the sanitized redirect, or to the admin home", () => {
    expect(privateRouteRedirect({ path: "/sign-in", search: "", redirect: "/admin/users", signedIn: true })).toBe("/admin/users");
    expect(privateRouteRedirect({ path: "/sign-in", search: "", redirect: "//evil.example", signedIn: true })).toBe("/admin");
    expect(privateRouteRedirect({ path: "/en/sign-in", search: "", redirect: undefined, signedIn: true })).toBe("/en/admin");
  });

  it("lets a guest see sign-in", () => {
    expect(privateRouteRedirect({ path: "/sign-in", search: "", redirect: "/admin", signedIn: false })).toBeNull();
  });
});
