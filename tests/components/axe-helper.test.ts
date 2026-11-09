import { afterEach, describe, expect, it } from "vitest";
import { axeViolations } from "./support/axe";

afterEach(() => {
  document.body.innerHTML = "";
});

// Guards the component a11y tests: if the helper silently stopped finding problems, every
// "has no axe violations" assertion would pass for the wrong reason.
describe("axe helper", () => {
  it("reports an unnamed button and an unlabelled input", async () => {
    document.body.innerHTML = '<main><button type="button"></button><input type="text" /></main>';
    const violations = await axeViolations(document.body);
    expect(violations.some((line) => line.startsWith("button-name"))).toBe(true);
    expect(violations.some((line) => line.startsWith("label"))).toBe(true);
  });

  it("passes a labelled field and a named button", async () => {
    document.body.innerHTML = '<main><label for="a">Name</label><input id="a" type="text" /><button type="button">Save</button></main>';
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
