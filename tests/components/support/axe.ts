import axe from "axe-core";

/**
 * Runs axe (WCAG 2 A/AA and 2.1 A/AA) on an element that is attached to the document and returns
 * one readable line per violation. Colour contrast needs real layout and styles, which happy-dom
 * does not have, so it is checked by the Playwright axe matrix on the pages that use the component.
 */
export async function axeViolations(root: Element): Promise<string[]> {
  const results = await axe.run(root, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}
