import { expect, type Page } from "@playwright/test";

/** A unique query so the server renders fresh (pages are shared-cached for 60 s by full URL). */
export const fresh = (path: string) => `${path}${path.includes("?") ? "&" : "?"}cb=${Date.now()}${Math.floor(Math.random() * 1e6)}`;

/** Resolves once the app has hydrated (`<html data-hydrated="true">`, see the hydration-marker plugin). */
export async function waitForHydration(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true", { timeout: 20_000 });
}

/** Opens a path and waits for hydration, so the first interaction never races it. */
export async function gotoHydrated(page: Page, path: string, options: { fresh?: boolean } = {}) {
  await page.goto(options.fresh ? fresh(path) : path);
  await waitForHydration(page);
}

/**
 * Waits for every finite animation (a dialog fading in, a toast sliding) to finish and for one more frame. An
 * accessibility scan taken mid-animation judges half-faded colours, which are not what a visitor ends up seeing.
 */
export async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    const finite = () => document.getAnimations().filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime ?? 0));
    await Promise.all(finite().map((animation) => animation.finished.catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}
