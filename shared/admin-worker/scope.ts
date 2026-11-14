/** The slice of a service worker global the worker modules touch; keeps them pure and testable without a DOM. */
export interface WorkerEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

/** A page the worker controls or can see. */
export interface WorkerClientLike {
  url: string;
  visibilityState?: string;
  focused?: boolean;
  postMessage(message: unknown): void;
  focus?(): Promise<unknown>;
  navigate?(url: string): Promise<unknown>;
}

export interface WorkerScopeLike {
  addEventListener(type: string, listener: (event: WorkerEventLike) => void): void;
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
    matchAll?(options: { type: "window"; includeUncontrolled: boolean }): Promise<readonly WorkerClientLike[]>;
    openWindow?(url: string): Promise<unknown>;
  };
  registration?: { showNotification(title: string, options: object): Promise<void> };
  navigator?: { setAppBadge?(count: number): Promise<void>; clearAppBadge?(): Promise<void> };
  location?: { origin: string };
  /** The per-locale app name from the i18n messages; the server puts it in front of the script when it serves it. */
  ADMIN_APP_NAME?: string;
  fetch?(input: string, init?: object): Promise<{ ok: boolean; json(): Promise<unknown> }>;
}

/** A worker module: registers its own listeners on the scope. The entry lists them. */
export type WorkerModule = (scope: WorkerScopeLike) => void;

/** Registers a listener for an event shape the base scope type does not name. */
export function onEvent<E extends WorkerEventLike>(scope: WorkerScopeLike, type: string, handler: (event: E) => void): void {
  scope.addEventListener(type, handler as unknown as (event: WorkerEventLike) => void);
}
