export interface Crumb {
  label: string;
  to?: string;
}

/**
 * The breadcrumb to show: a page's override when it gave one, otherwise the nav-derived default.
 * The last crumb is the current page and never a link.
 */
export function resolveCrumbs(override: Crumb[] | null | undefined, fallback: Crumb[]): Crumb[] {
  const crumbs = override?.length ? override : fallback;
  return crumbs.map((crumb, index) => (index === crumbs.length - 1 ? { label: crumb.label } : crumb));
}
