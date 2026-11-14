import { POLL_NOW_MESSAGE } from "~~/shared/admin-worker/push-logic";
import { adminPwaPaths, badgeAction } from "~~/shared/utils/admin-pwa";
import { listenForInstall } from "~/composables/admin/useAdminInstall";

/** This locale's worker registration, set by `useAdminPwa` once the layout registers it; the push composable reads it. */
export const adminRegistration = shallowRef<ServiceWorkerRegistration | null>(null);

type BadgeNavigator = Navigator & { setAppBadge?: (count: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/**
 * The admin as an installable app (ADR-0028). Called once by the admin layout, so
 * the landing page never links a manifest or register a worker: this locale's manifest link (with credentials, so the
 * admin gate sees the session), this locale's worker registration, the install-prompt listener, and the app badge
 * that follows the unread count where the browser supports it. `registration` is the shared one the push composable uses.
 */
export function useAdminPwa(unread: Ref<number>, onPollNow?: () => void) {
  const { locale } = useI18n();
  const paths = computed(() => adminPwaPaths(locale.value === "en" ? "en" : "fa"));
  useHead(() => ({ link: [{ rel: "manifest", href: paths.value.manifest, crossorigin: "use-credentials" }] }));

  const registration = adminRegistration;
  const applyBadge = (count: number) => {
    const nav = navigator as BadgeNavigator;
    const action = badgeAction(count);
    const call = action.kind === "set" ? nav.setAppBadge?.(action.count) : nav.clearAppBadge?.();
    void call?.catch(() => undefined);
  };

  onMounted(() => {
    listenForInstall();
    if ("serviceWorker" in navigator) {
      // A push that arrived while this window is visible and focused: the worker shows nothing and asks for one poll now.
      navigator.serviceWorker.addEventListener("message", (event) => {
        if ((event.data as { type?: unknown } | null)?.type === POLL_NOW_MESSAGE) onPollNow?.();
      });
      navigator.serviceWorker.startMessages?.();
      // The scope has no trailing slash so the dashboard URL itself is inside; the worker answers with Service-Worker-Allowed.
      navigator.serviceWorker
        .register(paths.value.worker, { scope: paths.value.scope })
        .then((value) => (registration.value = value))
        .catch(() => undefined);
    }
    applyBadge(unread.value);
  });
  watch(unread, (count) => {
    if (import.meta.client) applyBadge(count);
  });
  return { registration };
}
