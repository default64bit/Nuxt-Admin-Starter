import { useLocalStorage } from "@vueuse/core";

/** The browser-stored "Play a sound on this device" choice. */
export const ADMIN_SOUND_STORAGE_KEY = "admin:sound";

/**
 * Default on. Stored in this browser only (never on the server), shared live between its tabs; when storage is
 * unavailable the choice lasts for the page only. Storage errors are swallowed.
 */
export function useAdminSoundPreference() {
  return useLocalStorage<boolean>(ADMIN_SOUND_STORAGE_KEY, true, { onError: () => undefined, listenToStorageChanges: true, initOnMounted: true });
}

/** Reads the choice without a reactive binding (the alert path); on when unset or unreadable. */
export function readAdminSoundPreference(): boolean {
  try {
    return localStorage.getItem(ADMIN_SOUND_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}
