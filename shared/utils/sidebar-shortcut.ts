export interface ShortcutEvent {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  // A DOM event's target is an `EventTarget`; only elements carry the fields read below.
  target: unknown;
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Sidebar toggle shortcut: Ctrl/Cmd with the physical B key (`event.code`, so it works on a Persian
 * layout where B types another character), ignored while focus is in an editable element so inputs
 * and rich-text editors keep Ctrl+B.
 */
export function isSidebarShortcut(event: ShortcutEvent): boolean {
  if (event.code !== "KeyB" || !(event.ctrlKey || event.metaKey)) return false;
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (target?.isContentEditable) return false;
  return !EDITABLE_TAGS.has((target?.tagName ?? "").toUpperCase());
}
