// The push decisions of the admin service worker, as pure functions (ADR-0028). No worker globals here: `push.ts` wires them to the real events. Relative imports only.

export const POLL_NOW_MESSAGE = "admin-poll-now";
export const APP_ICON = "/icons/icon-192.png";
export const APP_BADGE = "/icons/badge-96.png";

export interface PushPayload {
  notificationId: string | null;
  title: string;
  body: string;
  link: string | null;
  locale: "fa" | "en";
  dir: "rtl" | "ltr";
  unread: number;
  mustShow: boolean;
}

const isString = (value: unknown): value is string => typeof value === "string";

/** Reads the push body leniently: a missing field falls back, a body without a title is not usable. */
export function parsePushPayload(raw: unknown): PushPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (!isString(value.title) || value.title === "") return null;
  const locale = value.locale === "en" ? "en" : "fa";
  const unread = typeof value.unread === "number" && Number.isFinite(value.unread) ? Math.max(0, Math.floor(value.unread)) : 0;
  const id = isString(value.notificationId) && value.notificationId !== "" ? value.notificationId : isString(value.id) && value.id !== "" ? value.id : null;
  return {
    notificationId: id,
    title: value.title,
    body: isString(value.body) ? value.body : "",
    link: isString(value.link) && value.link !== "" ? value.link : null,
    locale,
    dir: value.dir === "ltr" || value.dir === "rtl" ? value.dir : locale === "fa" ? "rtl" : "ltr",
    unread,
    mustShow: value.mustShow === true,
  };
}

/** An admin page: `/admin…` or `/en/admin…`. */
export function isAdminPath(pathname: string): boolean {
  return /^(\/en)?\/admin(\/|$)/.test(pathname);
}

export interface ClientFacts {
  url: string;
  visibilityState?: string;
  focused?: boolean;
}

function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** Indexes of the admin windows that are visible and focused. */
export function activeAdminClientIndexes(clients: readonly ClientFacts[]): number[] {
  const found: number[] = [];
  clients.forEach((client, index) => {
    const path = pathOf(client.url);
    if (path !== null && isAdminPath(path) && client.visibilityState === "visible" && client.focused === true) found.push(index);
  });
  return found;
}

export type PushDecision = { kind: "poll"; clientIndexes: number[] } | { kind: "show" };

/** A visible, focused admin window and `mustShow` false: ask it to poll, show nothing. Otherwise show. */
export function decidePush(payload: PushPayload, clients: readonly ClientFacts[]): PushDecision {
  const active = activeAdminClientIndexes(clients);
  if (active.length > 0 && !payload.mustShow) return { kind: "poll", clientIndexes: active };
  return { kind: "show" };
}

export interface ShownNotification {
  title: string;
  options: { body: string; icon: string; badge: string; tag?: string; renotify: false; lang: string; dir: "rtl" | "ltr"; data: { id: string | null; link: string | null; locale: "fa" | "en" } };
}

export function buildNotification(payload: PushPayload): ShownNotification {
  return {
    title: payload.title,
    options: {
      body: payload.body,
      icon: APP_ICON,
      badge: APP_BADGE,
      ...(payload.notificationId ? { tag: payload.notificationId } : {}),
      renotify: false,
      lang: payload.locale,
      dir: payload.dir,
      data: { id: payload.notificationId, link: payload.link, locale: payload.locale },
    },
  };
}

/** The app badge follows the payload's unread count: a number, cleared at zero. */
export function badgeFor(unread: number): { kind: "set"; count: number } | { kind: "clear" } {
  const count = Number.isFinite(unread) ? Math.max(0, Math.floor(unread)) : 0;
  return count > 0 ? { kind: "set", count } : { kind: "clear" };
}

/** The admin path (with query and hash) a link points at on this origin; the admin home of the locale when it is absent or foreign. */
export function adminLinkPath(link: string | null, origin: string, locale: "fa" | "en"): string {
  const home = locale === "en" ? "/en/admin" : "/admin";
  if (!link) return home;
  try {
    const url = new URL(link, origin);
    if (url.origin !== origin || !isAdminPath(url.pathname)) return home;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return home;
  }
}

/** The sign-in page for the locale of the admin link, returning to that link afterwards. */
export function signInPath(adminPath: string): string {
  const english = /^\/en(\/|$)/.test(adminPath);
  return `${english ? "/en" : ""}/sign-in?redirect=${encodeURIComponent(adminPath)}`;
}

export type ClickPlan = { kind: "admin"; path: string; markReadId: string | null } | { kind: "sign-in"; path: string };

/** What a click does, given what the session answer says. `signedInAsAdmin` is false for a guest, a plain user or an unreadable answer. */
export function planClick(input: { link: string | null; id: string | null; locale: "fa" | "en"; origin: string; signedInAsAdmin: boolean }): ClickPlan {
  const path = adminLinkPath(input.link, input.origin, input.locale);
  return input.signedInAsAdmin ? { kind: "admin", path, markReadId: input.id } : { kind: "sign-in", path: signInPath(path) };
}

export function isAdminSession(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  return (body as { loggedIn?: unknown }).loggedIn === true;
}

/** An open admin window to reuse for the click, preferring the one already focused; null opens a new window. */
export function pickClientToFocus(clients: readonly ClientFacts[]): number | null {
  let fallback: number | null = null;
  for (const [index, client] of clients.entries()) {
    const path = pathOf(client.url);
    if (path === null || !isAdminPath(path)) continue;
    if (client.focused) return index;
    fallback ??= index;
  }
  return fallback;
}
