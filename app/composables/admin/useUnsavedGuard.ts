import { onBeforeRouteLeave, onBeforeRouteUpdate, type RouteLocationNormalized } from "vue-router";

/**
 * The leave guard of an admin page with unsaved edits: every way out (another route, the language switch,
 * closing or reloading the tab) asks first. A change of the query only (the page's own tab or filter state) stays on the page and never asks. The page renders an AlertDialog bound to `open` and answers with
 * `answer(true)` (discard) or `answer(false)` (keep editing); closing the dialog with Escape keeps editing.
 */
export function useUnsavedGuard(dirty: Ref<boolean>, onDiscard?: () => void) {
  const open = ref(false);
  let settle: ((leave: boolean) => void) | null = null;
  const ask = () =>
    new Promise<boolean>((resolve) => {
      settle = resolve;
      open.value = true;
    });
  const answer = (leave: boolean) => {
    settle?.(leave);
    settle = null;
    open.value = false;
  };
  watch(open, (isOpen) => {
    if (!isOpen && settle) answer(false);
  });
  const guard = async (to: RouteLocationNormalized, from: RouteLocationNormalized) => {
    if (!dirty.value || to.path === from.path) return true;
    const leave = await ask();
    if (leave) onDiscard?.();
    return leave;
  };
  onBeforeRouteUpdate(guard);
  onBeforeRouteLeave(guard);
  const warnOnUnload = (event: BeforeUnloadEvent) => {
    if (dirty.value) event.preventDefault();
  };
  onMounted(() => window.addEventListener("beforeunload", warnOnUnload));
  onBeforeUnmount(() => window.removeEventListener("beforeunload", warnOnUnload));
  return { open, answer };
}
