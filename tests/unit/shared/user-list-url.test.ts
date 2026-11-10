// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildUserListUrlQuery, parseUserListUrl } from "~~/shared/utils/user-list-url";

const ROLE = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("Users page URL state", () => {
  it("defaults to no filter and page 1, reads q, status, role and page, and drops invalid values", () => {
    expect(parseUserListUrl({})).toEqual({ page: 1 });
    expect(parseUserListUrl({ q: " nia ", status: "disabled", role: ROLE.toUpperCase(), page: "3" })).toEqual({ q: "nia", status: "disabled", role: ROLE, page: 3 });
    expect(parseUserListUrl({ q: "  ", status: "banned", role: "nope", page: "0" })).toEqual({ page: 1 });
    expect(parseUserListUrl({ type: "admin", q: ["a", "b"], page: ["2", "9"] })).toEqual({ q: "a", page: 2 });
  });

  it("writes only what differs from the defaults, and round-trips", () => {
    expect(buildUserListUrlQuery({ page: 1 })).toEqual({});
    const state = { q: "نیا", status: "active" as const, role: ROLE, page: 2 };
    expect(buildUserListUrlQuery(state)).toEqual({ q: "نیا", status: "active", role: ROLE, page: "2" });
    expect(parseUserListUrl(buildUserListUrlQuery(state))).toEqual(state);
  });
});
