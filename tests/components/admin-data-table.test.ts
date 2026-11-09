import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { DataTable } from "~/components/ui/data-table";

interface Row { id: number; name: string }
const columns = [{ accessorKey: "name", header: "Name" }] as never;
const rows = (count: number, from = 1): Row[] => Array.from({ length: count }, (_, i) => ({ id: from + i, name: `Row ${from + i}` }));

// The locale comes from the route prefix (Persian is unprefixed), like in the app.
let route = "/";
const mounted: { unmount: () => void }[] = [];
async function mount(props: Record<string, unknown>) {
  const wrapper = await mountSuspended(DataTable as never, { props: { columns, pageSize: 20, ...props }, attachTo: document.body, route });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

// The app's default locale is Persian; each block pins the locale it asserts.
describe("server-driven DataTable (en, LTR)", () => {
  beforeEach(async () => {
    route = "/en";
  });
  afterEach(() => {
    route = "/";
  });

  it("renders exactly the rows the server sent and shows the visible range of the total", async () => {
    const wrapper = await mount({ data: rows(20, 21), rowCount: 87, page: 2 });
    expect(wrapper.findAll("tbody tr")).toHaveLength(20);
    expect(wrapper.text()).toContain("Showing 21–40 of 87");
  });

  it("shows a shorter last range", async () => {
    const wrapper = await mount({ data: rows(7, 81), rowCount: 87, page: 5 });
    expect(wrapper.text()).toContain("Showing 81–87 of 87");
  });

  it("disables Previous on the first page and Next on the last page", async () => {
    const first = await mount({ data: rows(20), rowCount: 87, page: 1 });
    expect(first.find('[data-slot="table-previous"]').attributes("disabled")).toBeDefined();
    expect(first.find('[data-slot="table-next"]').attributes("disabled")).toBeUndefined();

    const last = await mount({ data: rows(7, 81), rowCount: 87, page: 5 });
    expect(last.find('[data-slot="table-next"]').attributes("disabled")).toBeDefined();
    expect(last.find('[data-slot="table-previous"]').attributes("disabled")).toBeUndefined();
  });

  it("asks for the neighbouring page through v-model:page", async () => {
    // A parent that applies the update, as `v-model:page` does, and serves the matching rows.
    const seen: number[] = [];
    const Host = defineComponent({
      setup() {
        const page = ref(2);
        return () =>
          h(DataTable as never, {
            columns,
            rowCount: 87,
            pageSize: 20,
            page: page.value,
            data: rows(20, (page.value - 1) * 20 + 1),
            "onUpdate:page": (next: number) => {
              seen.push(next);
              page.value = next;
            },
          });
      },
    });
    const wrapper = await mountSuspended(Host, { attachTo: document.body, route });
    mounted.push(wrapper);
    await wrapper.find('[data-slot="table-next"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Showing 41–60 of 87");
    expect(wrapper.text()).toContain("Row 41");
    await wrapper.find('[data-slot="table-previous"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Showing 21–40 of 87");
    expect(seen).toEqual([3, 2]);
  });

  it("offers only Previous and Next: no page numbers and no page-size selector", async () => {
    const wrapper = await mount({ data: rows(20, 21), rowCount: 87, page: 2 });
    const footer = wrapper.find('[data-slot="table-pagination"]');
    expect(footer.findAll("button")).toHaveLength(2);
    expect(footer.find("select, [role=combobox]").exists()).toBe(false);
  });

  it("hides the footer when there are no rows and still renders the empty slot", async () => {
    const wrapper = await mountSuspended(DataTable as never, {
      props: { columns, data: [], rowCount: 0, page: 1, pageSize: 20 },
      slots: { empty: () => "Nothing here" },
      attachTo: document.body,
      route,
    });
    mounted.push(wrapper);
    expect(wrapper.text()).toContain("Nothing here");
    expect(wrapper.find('[data-slot="table-pagination"]').exists()).toBe(false);
  });

  it("has no footer without a row count (client-side use is unchanged)", async () => {
    const wrapper = await mount({ data: rows(3) });
    expect(wrapper.findAll("tbody tr")).toHaveLength(3);
    expect(wrapper.find('[data-slot="table-pagination"]').exists()).toBe(false);
  });
});

describe("server-driven DataTable (fa, RTL)", () => {
  beforeEach(() => {
    route = "/";
  });
  it("uses Persian digits and words, and rotates the chevrons for RTL", async () => {
    const wrapper = await mount({ data: rows(20, 21), rowCount: 87, page: 2 });
    expect(wrapper.text()).toContain("نمایش ۲۱–۴۰ از ۸۷");
    expect(wrapper.find('[data-slot="table-previous"]').text()).toBe("قبلی");
    expect(wrapper.find('[data-slot="table-next"]').text()).toBe("بعدی");
    for (const slot of ["table-previous", "table-next"]) {
      expect(wrapper.find(`[data-slot="${slot}"] svg`).classes()).toContain("rtl:rotate-180");
    }
  });
});
