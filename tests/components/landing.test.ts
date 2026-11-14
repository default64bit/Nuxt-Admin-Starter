import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import Landing from "~/pages/index.vue";

describe("landing page", () => {
  it("links to admin sign-in in fa (unprefixed) and en (under /en)", async () => {
    const fa = await mountSuspended(Landing, { route: "/" });
    expect(fa.get('[data-testid="landing-sign-in"]').attributes("href")).toBe("/sign-in");
    expect(fa.get("h1").text()).not.toBe("");

    const en = await mountSuspended(Landing, { route: "/en" });
    expect(en.get('[data-testid="landing-sign-in"]').attributes("href")).toBe("/en/sign-in");
    expect(en.get('[data-testid="landing-language-switch"]').attributes("href")).toBe("/");
  });
});
