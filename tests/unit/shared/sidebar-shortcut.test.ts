// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isSidebarShortcut } from "~~/shared/utils/sidebar-shortcut";

const target = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable });
const press = (over: Record<string, unknown> = {}) => ({ code: "KeyB", key: "b", ctrlKey: true, metaKey: false, target: target("BODY"), ...over });

describe("isSidebarShortcut", () => {
  it("matches Ctrl or Cmd with the physical B key", () => {
    expect(isSidebarShortcut(press())).toBe(true);
    expect(isSidebarShortcut(press({ ctrlKey: false, metaKey: true }))).toBe(true);
  });

  it("works on a Persian layout where the B key types another character", () => {
    expect(isSidebarShortcut(press({ key: "ذ" }))).toBe(true);
  });

  it("needs the modifier and the right physical key", () => {
    expect(isSidebarShortcut(press({ ctrlKey: false }))).toBe(false);
    expect(isSidebarShortcut(press({ code: "KeyV", key: "b" }))).toBe(false);
  });

  it.each(["INPUT", "TEXTAREA", "SELECT"])("is ignored inside a %s so the editor keeps its keystroke", (tag) => {
    expect(isSidebarShortcut(press({ target: target(tag) }))).toBe(false);
  });

  it("is ignored inside a contenteditable (rich-text) element", () => {
    expect(isSidebarShortcut(press({ target: target("DIV", true) }))).toBe(false);
  });
});
