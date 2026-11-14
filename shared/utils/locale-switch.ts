export type SwitchableLocale = "fa" | "en";

/** The localized home page: Persian is unprefixed, English lives under `/en`. */
export function localeHomePath(locale: SwitchableLocale): string {
  return locale === "en" ? "/en" : "/";
}

/**
 * Target of a language-switch link. Query string and hash carry over unchanged (no feature
 * names a locale-bound parameter yet). When the current page has no localized equivalent
 * (`switchPath` is empty, e.g. the error page) the target is the other locale's home.
 */
export function languageSwitchHref(options: {
  target: SwitchableLocale;
  switchPath: string | undefined | null;
  search: string;
  hash: string;
}): string {
  const { target, switchPath, search, hash } = options;
  if (!switchPath) return localeHomePath(target);
  const pathOnly = switchPath.split(/[?#]/, 1)[0] || localeHomePath(target);
  const query = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  const fragment = hash && hash !== "#" ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${pathOnly}${query}${fragment}`;
}
