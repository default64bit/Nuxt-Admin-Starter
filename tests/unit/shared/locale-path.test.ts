// @vitest-environment node
import { describe, expect, it } from "vitest";
import { localizedPath } from "~~/shared/utils/locale-path";

describe("localizedPath", () => {
  it("leaves Persian paths unprefixed and prefixes English ones, even for routes that do not exist yet", () => {
    expect(localizedPath("/users", "fa")).toBe("/users");
    expect(localizedPath("/users", "en")).toBe("/en/users");
    expect(localizedPath("/admin/roles", "en")).toBe("/en/admin/roles");
    expect(localizedPath("/", "fa")).toBe("/");
    expect(localizedPath("/", "en")).toBe("/en");
    expect(localizedPath("audit-log", "en")).toBe("/en/audit-log");
  });
});
