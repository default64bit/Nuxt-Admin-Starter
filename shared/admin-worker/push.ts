import { POLL_NOW_MESSAGE, badgeFor, buildNotification, decidePush, isAdminSession, parsePushPayload, pickClientToFocus, planClick, type ClickPlan } from "./push-logic";
import { onEvent, type WorkerEventLike, type WorkerScopeLike } from "./scope";

// Push display and click for the admin (ADR-0028). There is no
// `fetch` event and no Cache Storage: the only network calls are the click's own session check and mark-read.

interface PushEventLike extends WorkerEventLike {
  data: { json(): unknown } | null;
}
interface ClickEventLike extends WorkerEventLike {
  notification: { close(): void; data?: { id?: string | null; link?: string | null; locale?: "fa" | "en" } | null };
}

async function setBadge(scope: WorkerScopeLike, unread: number): Promise<void> {
  const action = badgeFor(unread);
  try {
    if (action.kind === "set") await scope.navigator?.setAppBadge?.(action.count);
    else await scope.navigator?.clearAppBadge?.();
  } catch {
    // The badge is a convenience; a browser that refuses it changes nothing else.
  }
}

async function handlePush(scope: WorkerScopeLike, event: PushEventLike): Promise<void> {
  let payload = null;
  try {
    payload = parsePushPayload(event.data?.json() ?? null);
  } catch {
    // An unreadable body falls through to the generic notification below.
  }
  // A browser requires a visible notification for every push, so an unreadable body still shows something generic.
  if (!payload) {
    await scope.registration?.showNotification(scope.ADMIN_APP_NAME ?? "", { icon: "/icons/icon-192.png", badge: "/icons/badge-96.png" });
    return;
  }
  await setBadge(scope, payload.unread);
  const windows = (await scope.clients.matchAll?.({ type: "window", includeUncontrolled: true })) ?? [];
  const decision = decidePush(payload, windows);
  if (decision.kind === "poll") {
    for (const index of decision.clientIndexes) windows[index]?.postMessage({ type: POLL_NOW_MESSAGE });
    return;
  }
  const shown = buildNotification(payload);
  await scope.registration?.showNotification(shown.title, shown.options);
}

async function readSession(scope: WorkerScopeLike): Promise<boolean> {
  try {
    const response = await scope.fetch?.("/api/v1/auth/session", { credentials: "include", headers: { accept: "application/json" } });
    return response?.ok ? isAdminSession(await response.json()) : false;
  } catch {
    return false;
  }
}

async function carryOut(scope: WorkerScopeLike, plan: ClickPlan): Promise<void> {
  if (plan.kind === "sign-in") {
    await scope.clients.openWindow?.(plan.path);
    return;
  }
  if (plan.markReadId) {
    try {
      await scope.fetch?.(`/api/v1/admin/notifications/${encodeURIComponent(plan.markReadId)}/read`, { method: "POST", credentials: "include", headers: { accept: "application/json" } });
    } catch {
      // The item stays unread; opening it is what the admin asked for.
    }
  }
  const windows = (await scope.clients.matchAll?.({ type: "window", includeUncontrolled: true })) ?? [];
  const index = pickClientToFocus(windows);
  const target = index === null ? undefined : windows[index];
  if (target?.navigate && target.focus) {
    try {
      await target.navigate(plan.path);
      await target.focus();
      return;
    } catch {
      // Fall through to a new window.
    }
  }
  await scope.clients.openWindow?.(plan.path);
}

async function handleClick(scope: WorkerScopeLike, event: ClickEventLike): Promise<void> {
  const data = event.notification.data ?? {};
  event.notification.close();
  const origin = scope.location?.origin ?? "";
  const plan = planClick({ link: data.link ?? null, id: data.id ?? null, locale: data.locale === "en" ? "en" : "fa", origin, signedInAsAdmin: await readSession(scope) });
  await carryOut(scope, plan);
}

export function registerPush(scope: WorkerScopeLike): void {
  onEvent<PushEventLike>(scope, "push", (event) => event.waitUntil(handlePush(scope, event)));
  onEvent<ClickEventLike>(scope, "notificationclick", (event) => event.waitUntil(handleClick(scope, event)));
}
