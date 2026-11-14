// @vitest-environment node
import { describe, expect, it } from "vitest";
import { languageSwitchHref, localeHomePath } from "~~/shared/utils/locale-switch";

describe("languageSwitchHref", () => {
  it("keeps query and hash on the equivalent page", () => {
    expect(
      languageSwitchHref({
        target: "en",
        switchPath: "/en/users",
        search: "?sort=name",
        hash: "#results",
      }),
    ).toBe("/en/users?sort=name#results");
  });

  it("does not duplicate a query the router already appended", () => {
    expect(
      languageSwitchHref({
        target: "fa",
        switchPath: "/users?sort=name#results",
        search: "?sort=name",
        hash: "#results",
      }),
    ).toBe("/users?sort=name#results");
  });

  it("swaps only the prefix for an admin page", () => {
    expect(
      languageSwitchHref({
        target: "fa",
        switchPath: "/admin/roles",
        search: "?page=2",
        hash: "",
      }),
    ).toBe("/admin/roles?page=2");
  });

  it("lands on the other locale's home when no equivalent exists", () => {
    expect(
      languageSwitchHref({ target: "en", switchPath: "", search: "?x=1", hash: "#y" }),
    ).toBe("/en");
    expect(
      languageSwitchHref({ target: "fa", switchPath: undefined, search: "", hash: "" }),
    ).toBe("/");
  });

  it("maps locales to their home paths", () => {
    expect(localeHomePath("fa")).toBe("/");
    expect(localeHomePath("en")).toBe("/en");
  });
});
