import {
  languageSwitchHref,
  type SwitchableLocale,
} from "~~/shared/utils/locale-switch";

const CODES: readonly SwitchableLocale[] = ["fa", "en"];

/** Options for the language switch: every target is a real, crawlable URL. */
export function useLocaleSwitch() {
  const { locale } = useI18n();
  const route = useRoute();
  const switchLocalePath = useSwitchLocalePath();

  const options = computed(() => {
    const search = /\?[^#]*/.exec(route.fullPath)?.[0] ?? "";
    return CODES.map((code) => ({
      code,
      current: locale.value === code,
      href: languageSwitchHref({
        target: code,
        switchPath: switchLocalePath(code),
        search,
        hash: route.hash,
      }),
    }));
  });

  const current = computed(
    () => options.value.find((option) => option.current) ?? options.value[0]!,
  );
  const other = computed(
    () => options.value.find((option) => !option.current) ?? options.value[1]!,
  );

  return { options, current, other };
}
