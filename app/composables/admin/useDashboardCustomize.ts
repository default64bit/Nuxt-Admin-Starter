import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { dashboardModule, moduleTitleKey, type DashboardWidth } from "~~/shared/constants/dashboard-modules";
import type { DashboardPreferences } from "~~/shared/schemas/admin-dashboard";
import { parseApiError } from "~~/shared/utils/api-error-client";
import { defaultLayout, moveEntry, sameLayout, visibleEntries, type DashboardLayoutEntry } from "~~/shared/utils/dashboard-layout";
import { announce } from "@atlaskit/pragmatic-drag-and-drop-live-region";
import { placeNextTo, type MoveDirection, type Placement } from "~~/shared/utils/sortable";
import { ADMIN_DASHBOARD_KEY, useAdminDashboardPreferences } from "./useAdminDashboard";
import { useAdminCan } from "./useAdminCan";
import { useAdminFormat } from "./useAdminFormat";

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

/**
 * Customize mode (admin-dashboard spec "Customize mode"): the Dashboard arrangement as a draft that only Save writes.
 * The draft is its own copy, so a refetch of the saved preferences never replaces it; ranges are not part of it (a
 * range change saves at once and never touches the draft or its version). Reset to default changes the draft only; an
 * unchanged Reset is saved as `DELETE` (the arrangement becomes null), anything else as `PUT`.
 */
export function useDashboardCustomize() {
  const queryClient = useQueryClient();
  const preferences = useAdminDashboardPreferences();
  const can = useAdminCan();
  const { t, num } = useAdminFormat();

  const draft = ref<DashboardLayoutEntry[] | null>(null);
  const baseline = ref<DashboardLayoutEntry[]>([]);
  const version = ref<string | null>(null); // the `arrangementUpdatedAt` the draft was loaded with
  const resetUnchanged = ref(false);
  const announcement = ref("");
  const saveError = ref(false);
  const stale = ref(false);

  const customizing = computed(() => draft.value !== null);
  const dirty = computed(() => draft.value !== null && (resetUnchanged.value || !sameLayout(draft.value, baseline.value)));
  const copy = (entries: readonly DashboardLayoutEntry[]) => entries.map((entry) => ({ ...entry }));

  function start() {
    const saved = preferences.data.value;
    if (!saved) return;
    baseline.value = copy(saved.modules);
    draft.value = copy(saved.modules);
    version.value = saved.arrangementUpdatedAt;
    resetUnchanged.value = false;
    saveError.value = false;
    stale.value = false;
    announcement.value = "";
  }
  function leave() {
    draft.value = null;
    resetUnchanged.value = false;
    saveError.value = false;
    stale.value = false;
  }

  /** Any edit to the draft: it is no longer an untouched Reset. */
  function edit(next: DashboardLayoutEntry[]) {
    draft.value = next;
    resetUnchanged.value = false;
    saveError.value = false;
  }
  const titleOf = (moduleKey: string) => t(moduleTitleKey(moduleKey));

  /** Moves a module and announces where it landed; returns whether anything moved. */
  function move(moduleKey: string, direction: MoveDirection): boolean {
    if (!draft.value) return false;
    const moved = moveEntry(draft.value, moduleKey, direction);
    if (!moved) return false;
    edit(moved.entries);
    announcement.value = t("admin.dashboard.customize.moved", { module: titleOf(moduleKey), position: num(moved.position), total: num(moved.entries.length) });
    return true;
  }
  /**
   * A drag-and-drop move: the module lands before or after another. The new
   * position is announced through the drag-and-drop live region, so the Move menu's status line is not repeated.
   */
  function moveTo(moduleKey: string, targetKey: string, placement: Placement): boolean {
    if (!draft.value) return false;
    const moved = placeNextTo(draft.value, moduleKey, targetKey, placement);
    if (!moved) return false;
    edit(moved.items);
    announce(t("admin.dashboard.customize.moved", { module: titleOf(moduleKey), position: num(moved.position), total: num(moved.items.length) }));
    return true;
  }
  function resize(moduleKey: string, width: DashboardWidth) {
    if (draft.value) edit(draft.value.map((entry) => (entry.key === moduleKey ? { ...entry, width } : entry)));
  }
  function setFill(moduleKey: string, fill: boolean) {
    if (draft.value) edit(draft.value.map((entry) => (entry.key === moduleKey ? { ...entry, fill } : entry)));
  }
  function remove(moduleKey: string) {
    if (!draft.value) return;
    edit(draft.value.filter((entry) => entry.key !== moduleKey));
    announcement.value = t("admin.dashboard.customize.removed", { module: titleOf(moduleKey) });
  }
  /**
   * Choose modules: ticking adds a module at the end with its default width and Fill off (its range is the stored or
   * default one, because ranges are never part of the draft); only a module the admin may see (the picker list) is added.
   */
  function add(moduleKey: string) {
    const definition = dashboardModule(moduleKey);
    if (!draft.value || !definition || draft.value.some((entry) => entry.key === moduleKey)) return;
    if (!(preferences.data.value?.pickerModules ?? []).includes(moduleKey)) return;
    edit([...draft.value, { key: moduleKey, width: definition.defaultWidth, fill: false }]);
    announcement.value = t("admin.dashboard.customize.added", { module: titleOf(moduleKey) });
  }
  /** The default list for this admin, as a draft: nothing is sent until Save. */
  function reset() {
    if (!draft.value) return;
    const isDefault = preferences.data.value?.isDefault ?? false;
    draft.value = visibleEntries(defaultLayout(), can);
    resetUnchanged.value = !isDefault;
    saveError.value = false;
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (resetUnchanged.value) return request("/api/v1/admin/account/dashboard/arrangement", { method: "DELETE", query: version.value ? { expectedUpdatedAt: version.value } : {} }) as Promise<DashboardPreferences>;
      return request("/api/v1/admin/account/dashboard/arrangement", { method: "PUT", body: { modules: draft.value, expectedUpdatedAt: version.value } }) as Promise<DashboardPreferences>;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(ADMIN_DASHBOARD_KEY, saved);
      leave();
    },
    onError: (error) => {
      if (parseApiError(error).code === "stale_layout") stale.value = true;
      else saveError.value = true;
    },
  });
  /** Save leaves Customize when it succeeds and stays in it, with the error, when it fails. Nothing changed: nothing to send. */
  function save() {
    if (!draft.value || saveMutation.isPending.value) return;
    if (!dirty.value) return leave();
    saveMutation.mutate();
  }
  /** After a conflict: discard the draft and show what the other device saved. */
  async function loadLatest() {
    await queryClient.refetchQueries({ queryKey: ADMIN_DASHBOARD_KEY });
    leave();
  }

  return {
    draft,
    customizing,
    dirty,
    announcement,
    saving: saveMutation.isPending,
    saveError,
    stale,
    start,
    cancel: leave,
    move,
    moveTo,
    resize,
    setFill,
    add,
    remove,
    reset,
    save,
    loadLatest,
  };
}
