import { toast } from "vue-sonner";

// A toast queued before a hard navigation (sign-out) shows once on the page that loads next.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("app:mounted", () => {
    try {
      const flash = sessionStorage.getItem("flash-toast");
      if (!flash) return;
      sessionStorage.removeItem("flash-toast");
      // The Toaster is client-only and mounts a tick after the app does; a toast raised before it listens is lost.
      if (flash === "signedOut") setTimeout(() => toast.success(nuxtApp.$i18n.t("auth.signedOut")), 100);
    } catch {
      // Storage unavailable: nothing to show.
    }
  });
});
