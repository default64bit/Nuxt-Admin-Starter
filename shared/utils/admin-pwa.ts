/**
 * The installable admin app, per locale (ADR-0028). Pure: the manifest, the per-locale addresses, and the Install
 * decision. Scopes have no trailing slash so the dashboard URL itself is inside.
 */
export type AdminPwaLocale = "fa" | "en";

export interface AdminPwaPaths {
  /** `/admin` or `/en/admin`: the manifest `id`, `scope` and `start_url`, and the worker's scope. */
  scope: string;
  manifest: string;
  worker: string;
}

export function adminPwaPaths(locale: AdminPwaLocale): AdminPwaPaths {
  const scope = locale === "en" ? "/en/admin" : "/admin";
  return { scope, manifest: `${scope}/manifest.webmanifest`, worker: `${scope}/sw.js` };
}

// A manifest takes literal colours (it is not CSS): the neutral white of the stock light theme.
const MANIFEST_COLOR = "#ffffff";

export interface AdminManifest {
  id: string;
  scope: string;
  start_url: string;
  name: string;
  short_name: string;
  lang: AdminPwaLocale;
  dir: "rtl" | "ltr";
  display: "standalone";
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: "any" | "maskable" }[];
}

/** `appName` is the per-locale app name from the i18n messages; nothing here names a product. */
export function buildAdminManifest(locale: AdminPwaLocale, appName: string): AdminManifest {
  const { scope } = adminPwaPaths(locale);
  const en = locale === "en";
  return {
    id: scope,
    scope,
    start_url: scope,
    name: appName,
    short_name: appName,
    lang: locale,
    dir: en ? "ltr" : "rtl",
    display: "standalone",
    background_color: MANIFEST_COLOR,
    theme_color: MANIFEST_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export type InstallState =
  /** The browser fired `beforeinstallprompt`: the Install button works. */
  | "prompt"
  /** Installable browser, no prompt yet: point at the address-bar install icon. */
  | "hint"
  /** Running as the installed app. */
  | "installed"
  /** iOS, or a browser that cannot install the app. */
  | "hidden";

export interface InstallFacts {
  standalone: boolean;
  ios: boolean;
  /** The browser can install web apps and fires `beforeinstallprompt` (Chromium family). */
  installSupported: boolean;
  promptAvailable: boolean;
}

export function decideInstallState(facts: InstallFacts): InstallState {
  if (facts.standalone) return "installed";
  if (facts.ios) return "hidden";
  if (facts.promptAvailable) return "prompt";
  return facts.installSupported ? "hint" : "hidden";
}

/** The app badge follows the unread count: a number, or cleared at zero. */
export function badgeAction(unread: number): { kind: "set"; count: number } | { kind: "clear" } {
  const count = Number.isFinite(unread) ? Math.max(0, Math.floor(unread)) : 0;
  return count > 0 ? { kind: "set", count } : { kind: "clear" };
}

/** iPhone, iPad (including iPadOS reporting as a Mac with touch): no install entry points there. */
export function isIosDevice(navigatorLike: { userAgent: string; platform?: string; maxTouchPoints?: number }): boolean {
  if (/iPad|iPhone|iPod/.test(navigatorLike.userAgent)) return true;
  return navigatorLike.platform === "MacIntel" && (navigatorLike.maxTouchPoints ?? 0) > 1;
}
