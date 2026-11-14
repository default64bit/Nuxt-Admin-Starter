import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises } from "@vue/test-utils";
import { mockNuxtImport, mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import AdminPageHeader from "~/components/admin/AdminPageHeader.vue";
import AdminSidebar from "~/components/admin/AdminSidebar.vue";
import AdminTopBar from "~/components/admin/AdminTopBar.vue";
import AdminUserMenu from "~/components/admin/AdminUserMenu.vue";
import AdminLayout from "~/layouts/admin.vue";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ADMIN_NAV } from "~~/shared/constants/admin-nav";
import { PERMISSION_KEYS } from "~~/shared/constants/permissions";

const { navigateToMock, toastError } = vi.hoisted(() => ({ navigateToMock: vi.fn(), toastError: vi.fn() }));
mockNuxtImport("navigateTo", () => navigateToMock);
vi.mock("vue-sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));

let permissions: string[] = [];
let names: { givenName: string | null; familyName: string | null } = { givenName: "Sara", familyName: "Rad" };
let logoutStatus = 204;
registerEndpoint("/api/v1/auth/session", () => ({ loggedIn: true, user: { ...names, permissions } }));
registerEndpoint("/api/v1/auth/logout", {
  method: "POST",
  handler: (event) => {
    event.node.res.statusCode = logoutStatus;
    return logoutStatus === 204 ? null : { statusCode: logoutStatus };
  },
});

// Suspense and the router resolve after a short real delay.
const settle = async () => {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 40));
  await flushPromises();
};
const mounted: { unmount: () => void }[] = [];
async function mount(component: object, options: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(component, { attachTo: document.body, ...options });
  mounted.push(wrapper);
  await settle();
  return wrapper;
}
async function mountInProvider(component: object, route = "/admin") {
  const Wrapper = defineComponent({ render: () => h(SidebarProvider, null, { default: () => h(component) }) });
  return mount(Wrapper, { route });
}
async function openMenu(wrapper: Awaited<ReturnType<typeof mount>>) {
  await wrapper.find("button[aria-haspopup=menu]").trigger("keydown", { key: "Enter" });
  await settle();
}
const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')];
const navHrefs = (wrapper: Awaited<ReturnType<typeof mount>>) => wrapper.findAll('[data-slot="sidebar-content"] a').map((a) => a.attributes("href"));

describe("admin shell", () => {
  beforeEach(() => {
    useNuxtApp().$queryClient.clear();
    permissions = [];
    names = { givenName: "Sara", familyName: "Rad" };
    logoutStatus = 204;
    navigateToMock.mockReset();
    toastError.mockReset();
    sessionStorage.clear();
  });
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount());
    document.body.innerHTML = "";
  });

  describe("sidebar", () => {
    it("shows the Dashboard alone, with no group headings, to a User holding no page Permission", async () => {
      const wrapper = await mountInProvider(AdminSidebar);
      expect(navHrefs(wrapper)).toEqual(["/admin"]);
      expect(wrapper.find('[data-slot="sidebar-group-label"]').exists()).toBe(false);
    });

    it("shows each destination the User may open, under its group, in the active locale's path", async () => {
      permissions = ["view-users", "view-audit-log"];
      const fa = await mountInProvider(AdminSidebar);
      expect(navHrefs(fa)).toEqual(["/admin", "/admin/users", "/admin/audit-log"]);
      expect(fa.findAll('[data-slot="sidebar-group-label"]')).toHaveLength(2);
      fa.unmount();
      useNuxtApp().$queryClient.clear();
      const en = await mountInProvider(AdminSidebar, "/en/admin");
      expect(navHrefs(en)).toEqual(["/en/admin", "/en/admin/users", "/en/admin/audit-log"]);
    });

    it("shows every declared destination to a User holding every Permission", async () => {
      permissions = [...PERMISSION_KEYS];
      const wrapper = await mountInProvider(AdminSidebar);
      expect(navHrefs(wrapper)).toHaveLength(ADMIN_NAV.length);
    });

    it("marks the active item with aria-current and derives the breadcrumb from the config", async () => {
      permissions = ["view-users"];
      const sidebar = await mountInProvider(AdminSidebar, "/admin/users");
      expect(sidebar.find('a[aria-current="page"]').attributes("href")).toBe("/admin/users");
      const bar = await mountInProvider(AdminTopBar, "/admin/users");
      expect(bar.findAll("li").map((li) => li.text()).filter(Boolean)).toEqual(["افراد", "کاربران"]);
      expect(bar.find('[aria-current="page"]').text()).toBe("کاربران");
    });
  });

  describe("top bar and Inbox mount points", () => {
    // The push banner renders only when push is available and not yet on, so it is checked by the Web Push e2e spec.
    it("has the Inbox bell in the top bar", async () => {
      const wrapper = await mount(AdminLayout, { slots: { default: () => h("p", "x") } });
      expect(wrapper.find('[data-slot="inbox-bell"]').exists()).toBe(true);
    });

    it("keeps the language and theme switches out of the top bar (they live in the user menu)", async () => {
      const wrapper = await mount(AdminLayout, { slots: { default: () => h("p", "x") } });
      expect(wrapper.find('[data-slot="appearance-switch"]').exists()).toBe(false);
      expect(wrapper.find('[data-slot="language-switch-trigger"]').exists()).toBe(false);
    });
  });

  describe("user menu", () => {
    it("shows the name, a language submenu, the two-state dark mode item and sign out, each with an icon", async () => {
      const wrapper = await mount(AdminUserMenu);
      await openMenu(wrapper);
      expect(document.querySelector('[role="menu"]')!.textContent).toContain("Sara Rad");
      expect(document.querySelectorAll('[role="menuitemcheckbox"]')).toHaveLength(1);
      expect(document.querySelector('[data-slot="admin-language-trigger"]')).not.toBeNull();
      expect(document.querySelector('[data-slot="admin-sign-out"]')).not.toBeNull();
      for (const entry of menuItems()) expect(entry.querySelector("svg"), entry.textContent ?? "").not.toBeNull();
    });

    it("toggles between light and dark only", async () => {
      const colorMode = useColorMode();
      colorMode.preference = "light";
      const wrapper = await mount(AdminUserMenu);
      await openMenu(wrapper);
      const toggle = document.querySelector<HTMLElement>('[data-slot="admin-theme-item"]')!;
      expect(toggle.getAttribute("aria-checked")).toBe("false");
      toggle.click();
      await settle();
      expect(colorMode.preference).toBe("dark");
      expect(document.querySelector('[role="menu"]')).not.toBeNull(); // the menu stays open
      document.querySelector<HTMLElement>('[data-slot="admin-theme-item"]')!.click();
      await settle();
      expect(colorMode.preference).toBe("light");
    });

    it("links the language options to the other locale, keeping the page", async () => {
      permissions = ["view-users"];
      const wrapper = await mount(AdminUserMenu, { route: "/admin/users" });
      await openMenu(wrapper);
      document.querySelector<HTMLElement>('[data-slot="admin-language-trigger"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await settle();
      const hrefs = [...document.querySelectorAll('[data-slot="admin-language-option"]')].map((a) => a.getAttribute("href"));
      expect(hrefs).toEqual(["/admin/users", "/en/admin/users"]);
    });

    it("shows a generic label, never an empty string, when the names are null", async () => {
      names = { givenName: null, familyName: null };
      const wrapper = await mount(AdminUserMenu);
      await openMenu(wrapper);
      const label = document.querySelector('[data-slot="admin-user-label"]')!.textContent!.trim();
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain("null");
    });

    it("signs out, queues the success toast and hard-navigates to sign-in", async () => {
      const wrapper = await mount(AdminUserMenu);
      await openMenu(wrapper);
      document.querySelector<HTMLElement>('[data-slot="admin-sign-out"]')!.click();
      await settle();
      expect(navigateToMock).toHaveBeenCalledWith("/sign-in", { external: true });
      expect(sessionStorage.getItem("flash-toast")).toBe("signedOut");
      expect(toastError).not.toHaveBeenCalled();
    });

    it("stays in the panel with an error toast when sign out fails", async () => {
      logoutStatus = 500;
      const wrapper = await mount(AdminUserMenu);
      await openMenu(wrapper);
      document.querySelector<HTMLElement>('[data-slot="admin-sign-out"]')!.click();
      await settle();
      expect(navigateToMock).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem("flash-toast")).toBeNull();
    });
  });

  describe("page header", () => {
    it("renders crumbs with the last one as plain current-page text, plus the title, actions and the section's hue", async () => {
      const wrapper = await mount(AdminPageHeader, {
        props: { title: "Users", crumbs: [{ label: "People", to: "/admin" }, { label: "Users" }] },
        slots: { actions: "<button>New</button>" },
      });
      expect(wrapper.find("h1").text()).toBe("Users");
      expect(wrapper.find('[aria-current="page"]').text()).toBe("Users");
      expect(wrapper.find("a").text()).toBe("People");
      expect(wrapper.text()).toContain("New");
    });
  });

  describe("layout", () => {
    it("keeps the sidebar and top bar when a page throws, with an inline alert and a working Retry", async () => {
      let fail = true;
      const Page = defineComponent({
        setup: () => () => {
          if (fail) throw new Error("boom");
          return h("p", { id: "page-ok" }, "fine");
        },
      });
      const wrapper = await mount(AdminLayout, { slots: { default: () => h(Page) } });
      expect(wrapper.find('[data-slot="sidebar"]').exists()).toBe(true);
      expect(wrapper.find('[data-slot="admin-top-bar"]').exists()).toBe(true);
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);
      fail = false;
      await wrapper.find('[data-slot="admin-retry"]').trigger("click");
      await settle();
      expect(wrapper.find("#page-ok").exists()).toBe(true);
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });
  });
});
