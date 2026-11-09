import { afterEach, describe, expect, it } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import AppearanceSwitch from "~/components/AppearanceSwitch.vue";
import LanguageSwitch from "~/components/LanguageSwitch.vue";
import { axeViolations } from "./support/axe";

const mounted: { unmount: () => void }[] = [];
async function mount(component: object, route: string) {
  const wrapper = await mountSuspended(component, { attachTo: document.body, route });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("LanguageSwitch", () => {
  it.each([
    ["/", "Fa", "فارسی", "/en"],
    ["/en", "En", "English", "/"],
  ])("on %s shows the current language and links to the other one", async (route, short, name, otherHref) => {
    const wrapper = await mount(LanguageSwitch, route);
    const trigger = wrapper.get('[data-slot="language-switch-trigger"]');
    expect(trigger.text()).toContain(short);
    expect(trigger.attributes("href")).toBe(otherHref);
    expect(trigger.get(".sr-only").text()).toContain(name);
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe("AppearanceSwitch", () => {
  it.each([
    ["/", "حالت تاریک"],
    ["/en", "Dark mode"],
  ])("on %s is a labelled switch", async (route, label) => {
    const wrapper = await mount(AppearanceSwitch, route);
    const control = wrapper.get('[role="switch"]');
    expect(control.attributes("aria-label")).toBe(label);
    expect(control.attributes("aria-checked")).toBe("false");
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
