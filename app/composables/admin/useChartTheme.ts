import type { ChartStyle } from "~~/shared/schemas/admin-dashboard";

/**
 * The colours of a chart style for the current theme (ADR-0025): read from the named `--chart-<style>-*` variables.
 * The `*Fade` colours are where a gradient bar dissolves into the card and `barDim` is an out-of-focus bucket; they are
 * empty for a style that draws flat bars (Soft, Pro). In Pro `bar` is an up bar and `barDim` the secondary series.
 */
export interface ChartTokens {
  bar: string;
  barFade: string;
  barDim: string;
  barDimFade: string;
  barNegative: string;
  barNegativeFade: string;
  hatch: string;
  grid: string;
  text: string;
  focus: string;
}

export function readChartTokens(style: ChartStyle = "soft"): ChartTokens {
  const computed = getComputedStyle(document.documentElement);
  const token = (name: string) => computed.getPropertyValue(`--chart-${style}-${name}`).trim();
  return {
    bar: token("bar"),
    barFade: token("bar-fade"),
    barDim: token("bar-dim"),
    barDimFade: token("bar-dim-fade"),
    barNegative: token("bar-negative"),
    barNegativeFade: token("bar-negative-fade"),
    hatch: token("hatch"),
    grid: token("grid"),
    text: token("text"),
    focus: token("focus"),
  };
}

/**
 * The chart tokens as a ref that is re-read whenever the theme changes (the `dark` class on `<html>` flips) or the
 * admin's Chart style does, so a chart built from it redraws in the new colours with nothing stale. Datasets must
 * depend on this ref, not cache their colours. Client-only: the first read happens once mounted.
 */
export function useChartTheme(style: MaybeRefOrGetter<ChartStyle> = "soft") {
  const tokens = ref<ChartTokens>(import.meta.client ? readChartTokens(toValue(style)) : readEmpty());
  const refresh = () => (tokens.value = readChartTokens(toValue(style)));
  onMounted(() => {
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    onBeforeUnmount(() => observer.disconnect());
  });
  watch(() => toValue(style), refresh);
  return tokens;
}

function readEmpty(): ChartTokens {
  return { bar: "", barFade: "", barDim: "", barDimFade: "", barNegative: "", barNegativeFade: "", hatch: "", grid: "", text: "", focus: "" };
}
