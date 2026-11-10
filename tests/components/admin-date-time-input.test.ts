import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import AdminDateTimeInput from "~/components/admin/AdminDateTimeInput.vue";

// The admin date-and-time input: a calendar (Persian in fa) plus a 24-hour time, read in Asia/Tehran,
// the model being one UTC instant. 1 Farvardin 1405 00:00 in Tehran is 2026-03-20T20:30:00Z.
const START = "2026-03-20T20:30:00.000Z";
const mounted: { unmount: () => void }[] = [];
// Suspense and the router resolve after a short real delay.
const settle = async () => {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 40));
  await flushPromises();
};
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = "";
});

async function mountWith(initial: string, route = "/") {
  const model = ref(initial);
  const Host = defineComponent({
    render: () => h(AdminDateTimeInput, { modelValue: model.value, label: "Start", dateLabel: "Start date", timeLabel: "Start time", "onUpdate:modelValue": (value: string) => (model.value = value) }),
  });
  const wrapper = await mountSuspended(Host, { attachTo: document.body, route });
  mounted.push(wrapper);
  await settle();
  return { wrapper, model };
}
const time = (wrapper: Awaited<ReturnType<typeof mountWith>>["wrapper"]) => wrapper.find('[data-slot="time-input"]');

describe("AdminDateTimeInput", () => {
  it("shows the Jalali date and Persian digits in fa, from the UTC instant", async () => {
    const { wrapper } = await mountWith(START);
    expect(wrapper.find('[data-slot="date-trigger"]').text()).toBe("۱ فروردین ۱۴۰۵");
    expect((time(wrapper).element as HTMLInputElement).value).toBe("۰۰:۰۰");
  });

  it("shows the Gregorian date and Western digits in en", async () => {
    const { wrapper } = await mountWith(START, "/en");
    expect(wrapper.find('[data-slot="date-trigger"]').text()).toBe("21 March 2026");
    expect((time(wrapper).element as HTMLInputElement).value).toBe("00:00");
  });

  it("is a labelled group whose date button and time field are labelled, with the date in the button's name", async () => {
    const { wrapper } = await mountWith(START, "/en");
    expect(wrapper.find('[role="group"]').attributes("aria-label")).toBe("Start");
    expect(wrapper.find('[data-slot="date-trigger"]').attributes("aria-label")).toBe("Start date: 21 March 2026");
    expect(time(wrapper).attributes("aria-label")).toBe("Start time");
    expect(time(wrapper).attributes("dir")).toBe("ltr");
  });

  it("emits the UTC instant of a typed Tehran time, in Persian digits too", async () => {
    const { wrapper, model } = await mountWith(START);
    await time(wrapper).setValue("۱۴:۳۵");
    expect(model.value).toBe("2026-03-21T11:05:00.000Z"); // 14:35 Tehran is 11:05 UTC
    await time(wrapper).setValue("23:59");
    expect(model.value).toBe("2026-03-21T20:29:00.000Z");
  });

  it("empties the model while the time is not a time, keeping the chosen date", async () => {
    const { wrapper, model } = await mountWith(START, "/en");
    await time(wrapper).setValue("25:00");
    await flushPromises();
    expect(model.value).toBe("");
    expect(time(wrapper).attributes("aria-invalid")).toBe("true");
    expect(wrapper.find('[data-slot="date-trigger"]').text()).toBe("21 March 2026");
    await time(wrapper).setValue("10:00");
    expect(model.value).toBe("2026-03-21T06:30:00.000Z");
  });

  it("tidies a valid time when the field loses focus", async () => {
    const { wrapper, model } = await mountWith(START, "/en");
    await time(wrapper).setValue("0905");
    expect(model.value).toBe("2026-03-21T05:35:00.000Z");
    await time(wrapper).trigger("blur");
    expect((time(wrapper).element as HTMLInputElement).value).toBe("09:05");
  });

  it("follows an outside change of the model", async () => {
    const { wrapper, model } = await mountWith("", "/en");
    expect(wrapper.find('[data-slot="date-trigger"]').text()).toBe("Start date");
    model.value = "2026-06-15T21:00:00.000Z"; // 00:30 on 16 June in Tehran
    await settle();
    expect(wrapper.find('[data-slot="date-trigger"]').text()).toBe("16 June 2026");
    expect((time(wrapper).element as HTMLInputElement).value).toBe("00:30");
  });

  it("picks a date from the calendar with the keyboard-reachable cells, starting the day at 00:00", async () => {
    const { wrapper, model } = await mountWith("", "/en");
    await wrapper.find('[data-slot="date-trigger"]').trigger("click");
    await settle();
    const cell = document.body.querySelector<HTMLElement>('[data-slot="calendar-cell-trigger"]:not([data-outside-view])');
    expect(cell, "the calendar opens with day cells").not.toBeNull();
    cell!.click();
    await settle();
    expect(model.value).toMatch(/T(20|19):30:00\.000Z$/); // Tehran midnight is 20:30 UTC (19:30 UTC in the old summer time)
    expect((time(wrapper).element as HTMLInputElement).value).toBe("00:00");
  });
});
