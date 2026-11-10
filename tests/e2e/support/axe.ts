import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { settleAnimations } from "./page";

/** Fails on any WCAG 2 A/AA or 2.1 A/AA violation on the current page, after animations have finished. */
export async function expectNoAxeViolations(page: Page) {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}
