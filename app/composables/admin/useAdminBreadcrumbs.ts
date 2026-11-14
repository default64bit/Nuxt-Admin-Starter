import type { Crumb } from "~~/shared/utils/admin-breadcrumbs";

export interface AdminCrumbInput {
  /** An `admin.*` i18n key, translated for the active locale. */
  labelKey?: string;
  label?: string;
  to?: string;
}

/** Page-level override of the top-bar breadcrumb; cleared when the page unmounts. */
export function useAdminBreadcrumbs(input?: AdminCrumbInput[]) {
  const { t } = useI18n();
  const override = useState<Crumb[] | null>("admin-breadcrumbs", () => null);
  const set = (crumbs: AdminCrumbInput[] | null) => {
    override.value = crumbs?.map((crumb) => ({ label: crumb.labelKey ? t(crumb.labelKey) : (crumb.label ?? ""), to: crumb.to })) ?? null;
  };
  if (input) {
    set(input);
    onBeforeUnmount(() => set(null));
  }
  return { override, set };
}
