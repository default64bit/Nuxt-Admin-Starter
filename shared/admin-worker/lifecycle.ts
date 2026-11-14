import type { WorkerModule } from "./scope";

/**
 * Lifecycle only: a new worker takes over at once. There is deliberately no `fetch` listener and no Cache Storage
 * (ADR-0028): pages and API data are never cached and the admin has no offline mode.
 */
export const registerLifecycle: WorkerModule = (scope) => {
  scope.addEventListener("install", (event) => event.waitUntil(scope.skipWaiting()));
  scope.addEventListener("activate", (event) => event.waitUntil(scope.clients.claim()));
};
