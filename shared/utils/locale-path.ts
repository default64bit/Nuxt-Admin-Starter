export type PathLocale = "fa" | "en";

/**
 * Prefixes a reserved route with the locale (Persian unprefixed, English under `/en`). Pure string
 * work on purpose: the router can only localize routes that exist, and the shell links to routes
 * other efforts have not built yet.
 */
export function localizedPath(path: string, locale: PathLocale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale !== "en") return clean;
  return clean === "/" ? "/en" : `/en${clean}`;
}
