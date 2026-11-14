// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveCrumbs } from "~~/shared/utils/admin-breadcrumbs";

const dashboard = [{ label: "Dashboard" }];

describe("resolveCrumbs", () => {
  it("defaults to the nav-derived crumbs", () => {
    expect(resolveCrumbs(null, dashboard)).toEqual([{ label: "Dashboard" }]);
  });

  it("uses a page override exactly, in order", () => {
    const override = [{ label: "People", to: "/admin/people" }, { label: "Sara" }];
    expect(resolveCrumbs(override, dashboard)).toEqual(override);
  });

  it("makes the last crumb the current page (never a link)", () => {
    expect(resolveCrumbs([{ label: "A", to: "/a" }, { label: "B", to: "/b" }], dashboard)).toEqual([{ label: "A", to: "/a" }, { label: "B" }]);
  });

  it("falls back to the default for an empty override", () => {
    expect(resolveCrumbs([], dashboard)).toEqual(dashboard);
  });
});
