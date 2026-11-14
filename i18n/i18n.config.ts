// The URL is the only source of the active language (localization spec). A missing key must
// surface as a failing test, so there is deliberately no cross-language fallback.
export default defineI18nConfig(() => ({
  legacy: false,
  locale: "fa",
  fallbackLocale: false,
}));
