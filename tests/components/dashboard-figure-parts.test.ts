import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import MicroBar from "~/components/admin/dashboard/MicroBar.vue";
import RateFigure from "~/components/admin/dashboard/RateFigure.vue";
import RateRing from "~/components/admin/dashboard/RateRing.vue";
import Sparkline from "~/components/admin/dashboard/Sparkline.vue";
import TickerLine from "~/components/admin/dashboard/TickerLine.vue";
import ValueDeltaFigure from "~/components/admin/dashboard/ValueDeltaFigure.vue";

// The module-building kit (.specs/admin-dashboard/spec.md "Figure parts"). The Chart style is the one thing the parts read
// from outside, so it is stubbed instead of fetched.
const style = vi.hoisted(() => ({ value: { value: "soft" } as { value: string } }));
vi.mock("~/composables/admin/useChartStyle", () => ({ useChartStyle: () => style.value }));

const mounted: { unmount: () => void }[] = [];
async function mount(component: object, props: Record<string, unknown>, chartStyle = "soft", route = "/en") {
  style.value = ref(chartStyle);
  const wrapper = await mountSuspended(component, { props, route, attachTo: document.body });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()));

describe("the figures", () => {
  it.each([
    ["rises", { value: 12, previous: 10 }, "+20%", "up"],
    ["falls", { value: 8, previous: 10 }, "−20%", "down"],
    ["starts from nothing", { value: 5, previous: 0 }, "New", "new"],
    ["has nothing either side", { value: 0, previous: 0 }, "—", "none"],
  ])("a value+delta figure that %s shows the change as text and an arrow, not colour alone", async (_name, props, text, change) => {
    const wrapper = await mount(ValueDeltaFigure, { label: "Accounts", ...props });
    const badge = wrapper.get('[data-slot="value-delta-change"]');
    expect(badge.attributes("data-change")).toBe(change);
    expect(badge.get('[aria-hidden="true"]:not(svg)').text()).toBe(text);
    expect(badge.get(".sr-only").text()).not.toBe("");
    expect(wrapper.find('[data-slot="ticker-line"]').exists()).toBe(false); // Soft draws no ticker line
  });

  it("a value+delta figure in Pro adds a ticker line, flipped by lowerIsBetter", async () => {
    const better = await mount(ValueDeltaFigure, { label: "A", value: 12, previous: 10 }, "pro");
    expect(better.get('[data-slot="ticker-line"]').classes().join(" ")).toContain("chart-pro-bar)");
    const worse = await mount(ValueDeltaFigure, { label: "A", value: 12, previous: 10, lowerIsBetter: true }, "pro");
    expect(worse.get('[data-slot="ticker-line"]').classes().join(" ")).toContain("chart-pro-bar-negative");
  });

  it.each([
    ["en", "/en", "72.5%", "+3.5 pts"],
    ["fa", "/", "۷۲٫۵٪", "+۳٫۵ واحد درصد"],
  ])("a rate figure in %s shows the rate and the change in points with locale digits", async (_locale, route, rate, change) => {
    const wrapper = await mount(RateFigure, { label: "Rate", value: 72.5, previous: 69, empty: "No data" }, "soft", route);
    expect(wrapper.get('[data-slot="rate-figure-value"]').text()).toBe(rate);
    expect(wrapper.get('[data-slot="rate-figure-change"] [aria-hidden="true"]:not(svg)').text()).toBe(change);
  });

  it("a rate figure with no rate shows a dash and the empty line, never 0%, and the ring only in Pro", async () => {
    const empty = await mount(RateFigure, { label: "Rate", value: null, previous: 50, empty: "No data" });
    expect(empty.get('[data-slot="rate-figure-value"]').text()).toBe("—");
    expect(empty.get('[data-slot="rate-figure-empty"]').text()).toBe("No data");
    expect((await mount(RateFigure, { label: "Rate", value: 40, previous: 50, empty: "" }, "pro")).find('[data-slot="rate-ring"]').exists()).toBe(true);
    expect((await mount(RateFigure, { label: "Rate", value: 40, previous: 50, empty: "" })).find('[data-slot="rate-ring"]').exists()).toBe(false);
  });
});

describe("the marks", () => {
  it("a rate ring draws an arc clamped to 0–100", async () => {
    const arc = async (value: number) => (await mount(RateRing, { value })).get("circle:nth-of-type(2)").attributes("stroke-dasharray");
    expect(await arc(40)).toBe("40 100");
    expect(await arc(250)).toBe("100 100");
    expect(await arc(-5)).toBe("0 100");
  });

  it("a micro bar is a share of the largest value, clamped, and empty for no value", async () => {
    const share = async (value: number, max: number) => (await mount(MicroBar, { value, max })).get("svg").attributes("data-share");
    expect(await share(5, 20)).toBe("25");
    expect(await share(30, 20)).toBe("100");
    expect(await share(0, 20)).toBe("0");
    expect(await share(3, 0)).toBe("0");
  });

  it.each([
    ["up", "1,8 8,5 14,6 23,1.5"],
    ["down", "1,2 8,5 14,4 23,8.5"],
    ["flat", "1,5 23,5"],
  ])("a ticker line that goes %s draws its own line", async (direction, points) => {
    const wrapper = await mount(TickerLine, { direction, good: true });
    expect(wrapper.get("polyline").attributes("points")).toBe(points);
    expect(wrapper.get("svg").attributes("aria-hidden")).toBe("true");
  });

  it("a sparkline is a labelled image of one polyline scaled to the largest count, in each Chart style", async () => {
    for (const chartStyle of ["soft", "glow", "pro"]) {
      const wrapper = await mount(Sparkline, { counts: [0, 5, 10], label: "Accounts per day" }, chartStyle);
      const svg = wrapper.get("svg");
      expect(svg.attributes("role")).toBe("img");
      expect(svg.attributes("aria-label")).toBe("Accounts per day");
      expect(svg.attributes("data-chart-style")).toBe(chartStyle);
      expect(wrapper.get("polyline").attributes("points")).toBe("2.0,30.0 60.0,16.0 118.0,2.0");
    }
  });
});
