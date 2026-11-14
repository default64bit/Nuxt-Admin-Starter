/**
 * Document-level attributes derived from the URL alone: `lang` and `dir`.
 * Nothing here reads a cookie, so cached HTML is identical for every visitor.
 */
export function useRootAttributes() {
  const { localeProperties } = useI18n();

  const direction = computed(() => (localeProperties.value.dir === "rtl" ? "rtl" : "ltr"));

  useHead({
    htmlAttrs: {
      lang: computed(() => localeProperties.value.language ?? "fa-IR"),
      dir: direction,
    },
  });

  return { direction };
}
