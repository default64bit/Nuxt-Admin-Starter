import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

let counter = Math.floor(Math.random() * 60_000);

/**
 * The suite's `test`: every test gets its own client IP (`X-Forwarded-For`, which the OTP rate
 * limiters key on), so a fast run is never throttled by the per-IP limits and tests cannot starve
 * each other. The limits themselves stay exactly as in production.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    counter = (counter + 1) % 65_000;
    await context.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.${(counter >> 8) & 255}.${counter & 255}` });
    await use(context);
  },
});
