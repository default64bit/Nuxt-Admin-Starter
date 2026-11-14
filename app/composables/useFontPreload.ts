import interRegular from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";
import vazirmatnRegular from "@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2?url";

/** Preload only the active language's regular weight (ADR-0024). */
export function useFontPreload() {
  const { localeProperties } = useI18n();
  useHead({
    link: computed(() => [
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        crossorigin: "anonymous",
        href: localeProperties.value.dir === "rtl" ? vazirmatnRegular : interRegular,
      },
    ]),
  });
}
