import { decideInstallState, isIosDevice, type InstallState } from "~~/shared/utils/admin-pwa";

// The browser's `beforeinstallprompt` event, kept for the whole page load (client-owned, not serializable). The admin
// layout starts listening (`useAdminPwa`) so the event is never missed; the This device card and the user menu read it.
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const deferred = shallowRef<InstallPromptEvent | null>(null);
const standalone = ref(false);
const facts = reactive({ ios: false, installSupported: false });
let listening = false;

/** Starts the listeners once per page load. Client only. */
export function listenForInstall(): void {
  if (listening || !import.meta.client) return;
  listening = true;
  facts.ios = isIosDevice(navigator);
  facts.installSupported = "onbeforeinstallprompt" in window;
  const display = window.matchMedia("(display-mode: standalone)");
  standalone.value = display.matches;
  display.addEventListener("change", (event) => (standalone.value = event.matches));
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred.value = event as InstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    deferred.value = null;
    standalone.value = true;
  });
}

export function useAdminInstall() {
  const state = computed<InstallState>(() =>
    decideInstallState({
      standalone: standalone.value,
      ios: facts.ios,
      installSupported: facts.installSupported || deferred.value !== null,
      promptAvailable: deferred.value !== null,
    }),
  );
  async function install(): Promise<void> {
    const event = deferred.value;
    if (!event) return;
    // The event can be used once; the browser fires it again later if the prompt was dismissed.
    deferred.value = null;
    await event.prompt();
    await event.userChoice.catch(() => undefined);
  }
  return { state, install };
}
