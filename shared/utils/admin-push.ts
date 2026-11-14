import type { ChannelAvailability } from "../constants/admin-channels";
import { adminPwaPaths, type AdminPwaLocale } from "./admin-pwa";

/**
 * Browser push on the admin page, as pure decisions (the "Browser push" card and the turn-on banner). The browser calls
 * live in `useAdminPush`.
 */
export interface PushFacts {
  /** The push channel's availability from the settings answer; undefined while it has not loaded. */
  availability: ChannelAvailability | undefined;
  /** The VAPID public key the server hands out when push is configured. */
  vapidPublicKey: string | undefined;
  /** iPhone or iPad, and not running as the installed app. */
  iosNotInstalled: boolean;
  /** Service workers, the Push API and Notifications all exist here. */
  supported: boolean;
  permission: NotificationPermission;
  /** This browser holds a push subscription from this locale's worker. */
  subscribed: boolean;
}

export type PushHereState =
  /** Not configured / disabled / not loaded: the block is not shown. */
  | "hidden"
  | "ios-not-installed"
  | "unsupported"
  | "denied"
  | "on"
  | "off";

export function decidePushHereState(facts: PushFacts): PushHereState {
  if (facts.availability === undefined || facts.availability === "not_configured" || facts.availability === "disabled" || !facts.vapidPublicKey) return "hidden";
  if (facts.iosNotInstalled) return "ios-not-installed";
  if (!facts.supported) return "unsupported";
  if (facts.permission === "denied") return "denied";
  return facts.subscribed && facts.permission === "granted" ? "on" : "off";
}

/** The turn-on banner: push operational and supported here, permission still `default`, this browser not subscribed, not dismissed. */
export function shouldShowPushBanner(facts: PushFacts & { dismissed: boolean }): boolean {
  if (facts.dismissed || facts.availability !== "operational" || !facts.vapidPublicKey) return false;
  if (facts.iosNotInstalled || !facts.supported) return false;
  return facts.permission === "default" && !facts.subscribed;
}

/** The other locale's worker scope (`/admin` or `/en/admin`): its subscription is removed before this locale's is made. */
export function otherAdminScope(locale: AdminPwaLocale): string {
  return adminPwaPaths(locale === "en" ? "fa" : "en").scope;
}

/** Every admin worker scope (both locales). */
export function isAdminWorkerScope(scopeUrl: string): boolean {
  try {
    const { pathname } = new URL(scopeUrl, "http://localhost");
    const normalized = pathname.replace(/\/$/, "");
    return normalized === adminPwaPaths("fa").scope || normalized === adminPwaPaths("en").scope;
  } catch {
    return false;
  }
}

export function scopePath(scopeUrl: string): string {
  try {
    return new URL(scopeUrl, "http://localhost").pathname.replace(/\/$/, "");
  } catch {
    return scopeUrl;
  }
}

/** The VAPID public key (URL-safe base64) as the bytes `PushManager.subscribe` wants. */
export function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export const PUSH_BANNER_DISMISSED_KEY = "admin:push-banner-dismissed";
export const PUSH_DEVICE_ID_KEY = "admin:push-device-id";
/** Gives up on browser/server cleanup at sign-out after this long, so it can never hold sign-out back. */
export const SIGN_OUT_CLEANUP_MS = 4000;
