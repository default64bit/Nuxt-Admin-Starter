/**
 * The one light/dark control: a wrapper over @nuxtjs/color-mode, whose
 * pre-paint script has already put `dark` on <html> before this runs. `isDark` is false until
 * mount so server and client render identical markup; visuals that must not wait for hydration
 * (the switch thumb, sun/moon emphasis) are driven by the `.dark` class in CSS, not by this value.
 */
export function useAppearance() {
  const colorMode = useColorMode();
  const mounted = ref(false);
  onMounted(() => {
    mounted.value = true;
  });

  const isDark = computed(() => mounted.value && colorMode.value === "dark");

  function setDark(dark: boolean) {
    colorMode.preference = dark ? "dark" : "light";
  }

  return { isDark, setDark };
}
