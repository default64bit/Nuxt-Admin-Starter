import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { adminRegistration } from "~/composables/admin/useAdminPwa";
import { useAdminNotificationSettings } from "~/composables/admin/useAdminNotificationSettings";
import type { PushDeviceView, PushTestResult } from "~~/shared/schemas/admin-push-subscriptions";
import { parseApiError } from "~~/shared/utils/api-error-client";
import {
  PUSH_BANNER_DISMISSED_KEY,
  PUSH_DEVICE_ID_KEY,
  SIGN_OUT_CLEANUP_MS,
  decidePushHereState,
  isAdminWorkerScope,
  scopePath,
  shouldShowPushBanner,
  urlBase64ToBytes,
  type PushFacts,
} from "~~/shared/utils/admin-push";
import { isIosDevice } from "~~/shared/utils/admin-pwa";

export const ADMIN_PUSH_DEVICES_KEY = ["admin", "push-subscriptions"] as const;
const BASE = "/api/v1/admin/account/push-subscriptions";

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

// This browser's push facts. They belong to the browser, not to the server, so they live here and not in Vue Query.
const browser = reactive({ checked: false, supported: false, iosNotInstalled: false, permission: "default" as NotificationPermission, subscribed: false });
const thisDeviceId = ref<string | null>(null);
const dismissed = ref(false);
let watching = false;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

function localeOf(code: string): "fa" | "en" {
  return code === "en" ? "en" : "fa";
}

async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const registration = adminRegistration.value ?? (await navigator.serviceWorker.ready);
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Re-reads what this browser knows: support, permission and whether this locale's worker holds a subscription. */
async function refreshBrowser(): Promise<void> {
  browser.supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  browser.iosNotInstalled = isIosDevice(navigator) && !window.matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & { standalone?: boolean }).standalone;
  if ("Notification" in window) browser.permission = Notification.permission;
  browser.checked = true;
  if (!browser.supported) return;
  browser.subscribed = (await currentSubscription()) !== null;
}

function startWatching(): void {
  if (watching || !import.meta.client) return;
  watching = true;
  dismissed.value = readStorage(PUSH_BANNER_DISMISSED_KEY) === "1";
  thisDeviceId.value = readStorage(PUSH_DEVICE_ID_KEY);
  void refreshBrowser();
  // The registration arrives after the layout mounts; look again then.
  watch(adminRegistration, () => void refreshBrowser());
  try {
    void navigator.permissions?.query({ name: "notifications" }).then((status) => status.addEventListener("change", () => void refreshBrowser())).catch(() => undefined);
  } catch {
    // Browsers without the Permissions API keep the value read after each request.
  }
}

/** Every admin worker registration of this browser (both locales). */
async function adminRegistrations(): Promise<ServiceWorkerRegistration[]> {
  if (!("serviceWorker" in navigator)) return [];
  return (await navigator.serviceWorker.getRegistrations()).filter((registration) => isAdminWorkerScope(registration.scope));
}

async function removeOnServer(endpoint: string): Promise<void> {
  await request(BASE, { method: "DELETE", body: { endpoint }, headers: { accept: "application/json" } });
}

/** Removes one registration's subscription on the server first, then in the browser. Throws when the server refuses, so nothing is half-done. */
async function dropSubscription(registration: ServiceWorkerRegistration): Promise<boolean> {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;
  await removeOnServer(subscription.endpoint);
  await subscription.unsubscribe().catch(() => undefined);
  return true;
}

/**
 * Sign-out cleanup: removes this browser's subscription (whichever locale's worker holds it) on the server and in the
 * browser, before the session ends. It never throws and never takes longer than a few seconds, so it cannot block sign-out.
 */
export async function removeThisBrowserPush(): Promise<void> {
  if (!import.meta.client || !("serviceWorker" in navigator)) return;
  const work = (async () => {
    for (const registration of await adminRegistrations()) {
      try {
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) continue;
        // The browser side goes even when the server call fails: the session is ending either way.
        await removeOnServer(subscription.endpoint).catch(() => undefined);
        await subscription.unsubscribe().catch(() => undefined);
      } catch {
        // Skip this registration.
      }
    }
    writeStorage(PUSH_DEVICE_ID_KEY, null);
    thisDeviceId.value = null;
    browser.subscribed = false;
  })();
  await Promise.race([work.catch(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, SIGN_OUT_CLEANUP_MS))]);
}

/** The admin's own push devices. Read-only, never polled; disabled while push is not offered. */
export function useAdminPushDevices(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: ADMIN_PUSH_DEVICES_KEY,
    queryFn: () => request(BASE, { headers: { accept: "application/json" } }) as Promise<PushDeviceView[]>,
    enabled: computed(() => import.meta.client && enabled.value),
    staleTime: 0,
    retry: false,
  });
}

export function useRemovePushDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<PushDeviceView[]>(ADMIN_PUSH_DEVICES_KEY, (list) => list?.filter((device) => device.id !== id));
      void queryClient.invalidateQueries({ queryKey: ADMIN_PUSH_DEVICES_KEY });
    },
  });
}

export type TurnOnResult = "on" | "denied" | "dismissed" | "failed";
export type SendTestResult = PushTestResult | "rate_limited" | "failed";

async function subscribeOnServer(subscription: PushSubscription, localeScope: "fa" | "en"): Promise<PushDeviceView> {
  const json = subscription.toJSON();
  const keys = json.keys ?? {};
  return (await request(BASE, { method: "POST", body: { endpoint: subscription.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, localeScope }, headers: { accept: "application/json" } })) as PushDeviceView;
}

/**
 * Browser push on this device (the "Browser push" card and the turn-on banner). The
 * decisions are in `shared/utils/admin-push.ts`; this reads the browser and calls the API. Shared state, so the banner,
 * the This device card and the devices list always agree.
 */
export function useAdminPush() {
  startWatching();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const settings = useAdminNotificationSettings();
  const channel = computed(() => settings.data.value?.channels.find((entry) => entry.key === "push"));

  const facts = computed<PushFacts>(() => ({
    availability: channel.value?.availability,
    vapidPublicKey: settings.data.value?.vapidPublicKey,
    iosNotInstalled: browser.iosNotInstalled,
    supported: browser.supported,
    permission: browser.permission,
    subscribed: browser.subscribed,
  }));
  const state = computed(() => (browser.checked ? decidePushHereState(facts.value) : "hidden"));
  const bannerVisible = computed(() => browser.checked && shouldShowPushBanner({ ...facts.value, dismissed: dismissed.value }));

  function dismissBanner(): void {
    dismissed.value = true;
    writeStorage(PUSH_BANNER_DISMISSED_KEY, "1");
  }

  async function activeRegistration(): Promise<ServiceWorkerRegistration> {
    return adminRegistration.value ?? (await navigator.serviceWorker.ready);
  }

  /** Asks permission (this must run inside the click), clears the other locale's subscription, subscribes and registers it. */
  async function turnOn(): Promise<TurnOnResult> {
    const key = settings.data.value?.vapidPublicKey;
    if (!key || !browser.supported) return "failed";
    try {
      const permission = await Notification.requestPermission();
      browser.permission = permission;
      if (permission === "denied") {
        dismissBanner(); // never returns after a denial
        return "denied";
      }
      if (permission !== "granted") return "dismissed";
      dismissBanner();

      const registration = await activeRegistration();
      // A subscription held by the other locale's worker would double every push: remove it, here and on the server.
      const mine = scopePath(registration.scope);
      for (const other of await adminRegistrations()) {
        if (scopePath(other.scope) === mine) continue;
        await dropSubscription(other).catch(() => undefined);
      }
      const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key) };
      let subscription: PushSubscription;
      try {
        subscription = await registration.pushManager.subscribe(options);
      } catch {
        // A subscription made with another key blocks a new one: drop it and try once more.
        await (await registration.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
        subscription = await registration.pushManager.subscribe(options);
      }
      try {
        const device = await subscribeOnServer(subscription, localeOf(locale.value));
        thisDeviceId.value = device.id;
        writeStorage(PUSH_DEVICE_ID_KEY, device.id);
      } catch (failed) {
        // Not registered with the server: leave nothing behind in the browser.
        await subscription.unsubscribe().catch(() => undefined);
        throw failed;
      }
      browser.subscribed = true;
      void queryClient.invalidateQueries({ queryKey: ADMIN_PUSH_DEVICES_KEY });
      return "on";
    } catch {
      await refreshBrowser();
      return "failed";
    }
  }

  /** Unsubscribes in the browser and on the server. Nothing changes when the server call fails, so it can be retried. */
  async function turnOff(): Promise<boolean> {
    try {
      await dropSubscription(await activeRegistration());
      writeStorage(PUSH_DEVICE_ID_KEY, null);
      thisDeviceId.value = null;
      browser.subscribed = false;
      void queryClient.invalidateQueries({ queryKey: ADMIN_PUSH_DEVICES_KEY });
      return true;
    } catch {
      return false;
    }
  }

  /** The test goes to this browser's own device; when the id is not known here the subscription is registered again to learn it. */
  async function sendTest(): Promise<SendTestResult> {
    try {
      let id = thisDeviceId.value;
      if (!id) {
        const subscription = await currentSubscription();
        if (!subscription) return "failed";
        id = (await subscribeOnServer(subscription, localeOf(locale.value))).id;
        thisDeviceId.value = id;
        writeStorage(PUSH_DEVICE_ID_KEY, id);
      }
      const answer = (await request(`${BASE}/${id}/test`, { method: "POST", body: {}, headers: { accept: "application/json" } })) as { result: PushTestResult };
      return answer.result;
    } catch (failed) {
      return parseApiError(failed).status === 429 ? "rate_limited" : "failed";
    }
  }

  return { channel, vapidPublicKey: computed(() => settings.data.value?.vapidPublicKey), state, bannerVisible, thisDeviceId, turnOn, turnOff, sendTest, dismissBanner, refresh: refreshBrowser };
}
