// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildRoleListUrlQuery, parseRoleListUrl } from "~~/shared/utils/role-list-url";

describe("Roles page URL state", () => {
  it("defaults to no search and page 1, reads q and page, and drops invalid values", () => {
    expect(parseRoleListUrl({})).toEqual({ page: 1 });
    expect(parseRoleListUrl({ q: " support ", page: "3" })).toEqual({ q: "support", page: 3 });
    expect(parseRoleListUrl({ q: "  ", page: "0" })).toEqual({ page: 1 });
    expect(parseRoleListUrl({ page: "1.5" })).toEqual({ page: 1 });
    expect(parseRoleListUrl({ q: ["a", "b"], page: ["2", "9"] })).toEqual({ q: "a", page: 2 });
  });

  it("writes only what differs from the defaults, and round-trips", () => {
    expect(buildRoleListUrlQuery({ page: 1 })).toEqual({});
    const state = { q: "پشتیبانی", page: 2 };
    expect(buildRoleListUrlQuery(state)).toEqual({ q: "پشتیبانی", page: "2" });
    expect(parseRoleListUrl(buildRoleListUrlQuery(state))).toEqual(state);
  });
});
