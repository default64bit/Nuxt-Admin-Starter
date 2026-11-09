import { toast } from "vue-sonner";

// A toast queued before a hard navigation (admin sign-out) shows once on the page that loads next.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("app:mounted", () => {
    try {
      const flash = sessionStorage.getItem("flash-toast");
      if (!flash) return;
      sessionStorage.removeItem("flash-toast");
      if (flash === "signedOut") toast.success(nuxtApp.$i18n.t("auth.signedOut"));
    } catch {
      // Storage unavailable: nothing to show.
    }
  });
});
