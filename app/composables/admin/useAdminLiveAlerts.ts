import { IconBell } from "@tabler/icons-vue";
import { useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { INBOX_TYPE_ICONS } from "~/components/admin/inbox-icons";
import { fetchNewInboxItems, useInboxMutations } from "~/composables/admin/useAdminInbox";
import { onAdminNavCountsChange } from "~/composables/admin/useAdminNavCounts";
import { readAdminSoundPreference } from "~/composables/admin/useAdminSoundPreference";
import { playAdminChime } from "~/utils/admin-chime";
import type { InboxItem } from "~~/shared/schemas/admin-notifications";
import {
  ALERT_TOAST_MS,
  LAST_ALERTED_STORAGE_KEY,
  alertFloor,
  compareAlertCursors,
  isNotificationsPagePath,
  latestCursor,
  parseStoredCursor,
  planAlerts,
  serializeCursor,
  shouldFetchNew,
  type AlertCursor,
} from "~~/shared/utils/admin-live-alerts";
import { renderAttentionText } from "~~/shared/utils/attention-message";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";
import { localizedPath } from "~~/shared/utils/locale-path";

/** Counts the batches that alerted; the bell watches it to ring once per batch. */
export const alertPulse = ref(0);

function readStoredMarker(): AlertCursor | null {
  try {
    return parseStoredCursor(localStorage.getItem(LAST_ALERTED_STORAGE_KEY));
  } catch {
    return null; // storage unavailable: the tab's own memory still stops repeats
  }
}

function writeStoredMarker(cursor: AlertCursor): void {
  try {
    // Only ever forward, so a slow tab cannot move the shared marker back.
    const next = latestCursor(readStoredMarker(), cursor);
    if (next) localStorage.setItem(LAST_ALERTED_STORAGE_KEY, serializeCursor(next));
  } catch {
    // Storage unavailable or full: nothing to share.
  }
}

/**
 * The live Inbox's alerts, mounted once in the admin layout. When the nav-counts poll shows a newer item than this tab
 * knows, it fetches the new unresolved items and, per batch, shows the toasts, rings the bell and plays the chime. The
 * decisions are in `shared/utils/admin-live-alerts.ts`; this wires them to the tab. It never refetches lists (the
 * nav-counts change already did).
 */
export function useAdminLiveAlerts() {
  const queryClient = useQueryClient();
  const route = useRoute();
  const { t, locale } = useI18n();
  const { markRead } = useInboxMutations();
  const digits = () => (locale.value === "en" ? "en" : "fa");

  // This tab's own knowledge: the newest item of its first answer (items before it never alert) and the marker it last wrote.
  let baselineKnown = false;
  let baseline: AlertCursor | null = null;
  let local: AlertCursor | null = null;
  let queue: Promise<void> = Promise.resolve();

  const floor = () => alertFloor({ baseline, stored: readStoredMarker(), local });

  function openItem(item: InboxItem) {
    if (!item.read) markRead.mutate(item.id);
    void navigateTo(localizedPath(item.link, digits()));
  }

  function showToasts(plan: ReturnType<typeof planAlerts>) {
    if (plan.toasts === "each") {
      for (const item of plan.items) {
        toast(renderAttentionText(item.type, item.tokens, digits()), {
          id: `admin-live-${item.id}`,
          icon: INBOX_TYPE_ICONS[item.type],
          duration: ALERT_TOAST_MS,
          closeButton: true,
          action: { label: t("admin.notifications.open"), onClick: () => openItem(item) },
        });
      }
    } else if (plan.toasts === "summary") {
      toast(t("admin.notifications.live.summary", { n: toLocaleDigits(String(plan.count), digits()) }), {
        id: "admin-live-summary",
        icon: IconBell,
        duration: ALERT_TOAST_MS,
        closeButton: true,
        action: { label: t("admin.notifications.viewAll"), onClick: () => void navigateTo(localizedPath("/admin/notifications", digits())) },
      });
    }
  }

  async function alertForNewItems(newest: AlertCursor | null) {
    const before = floor();
    if (!shouldFetchNew(newest, before)) return;
    let list;
    try {
      list = await fetchNewInboxItems(queryClient, before ? serializeCursor(before) : null);
    } catch {
      return; // the next poll tries again; a failed fetch never alerts
    }
    // Another tab may have alerted while this one fetched: decide against the marker as it is now.
    const after = floor();
    const sameFloor = (!before && !after) || (before && after && compareAlertCursors(before, after) === 0);
    const plan = planAlerts({ items: list.items, ...(sameFloor ? { total: list.total } : {}), floor: after, onNotificationsPage: isNotificationsPagePath(route.path) });
    if (!plan.alert || !plan.advanceTo) return;
    local = latestCursor(local, plan.advanceTo);
    writeStoredMarker(plan.advanceTo);
    showToasts(plan);
    alertPulse.value++;
    if (readAdminSoundPreference()) playAdminChime();
  }

  const stop = onAdminNavCountsChange((change) => {
    if (!baselineKnown) {
      // The tab's first answer is its baseline; if the counts were already cached, the answer before this one is.
      baselineKnown = true;
      const known = change.previous ? change.previous.newest : change.current.newest;
      baseline = known ? { createdAt: known.createdAt, id: known.id } : null;
    }
    if (!change.previous || !change.newestMoved) return;
    const newest = change.current.newest ? { createdAt: change.current.newest.createdAt, id: change.current.newest.id } : null;
    queue = queue.then(() => alertForNewItems(newest)).catch(() => undefined);
  });
  onScopeDispose(stop);
}
