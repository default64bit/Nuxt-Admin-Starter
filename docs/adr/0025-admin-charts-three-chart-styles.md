# ADR-0025: Admin charts use Chart.js in three Chart styles

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Admin charts must be readable, touch-friendly, correct in RTL `fa` with Jalali labels and in LTR `en`, and light enough for phones. The production `style-src` allows only hashes (ADR-0022), so a library that injects runtime `<style>` tags is blocked; `nuxt dev` does not exercise that policy. Each User chooses one of three Chart styles (Soft, Glow, Pro), separate from the light or dark theme (ADR-0012).

## Decision

1. **Chart.js 4.6.1 and vue-chartjs 5.3.4**, at exact versions.
2. **Buckets come from the server** and sit on a **category axis** with `Intl` labels. There is never a Gregorian time scale. The `fa` time axis is mirrored (newest at the left, y-axis on the right).
3. **Canvases draw with `direction: ltr`** so tick labels anchor correctly; the labels stay Persian.
4. **Colours come from named admin CSS variables** per Chart style and per theme. They are re-read, and charts redrawn, when the theme or style changes.
5. **Tooltips are our own HTML tooltips** in the app's locale, and every chart offers **View as table**.
6. **Rendering rules.** All chart code, chart.js, vue-chartjs and the helpers, forms **one lazy chunk of at most 75 KB gzip** that registers only the parts used and is never in the entry chunk. `perf:chart-chunk` enforces this in CI (a build without a chart file passes with a note; missing build output exits 2). A chart is created only when it scrolls into view, after hydration, and is never server-rendered. Sizes are never set through server-rendered `style` attributes.
7. **No change to the CSP.**

## Alternatives considered

- shadcn-vue Charts (Unovis): its injected `<style>` blocks under the CSP and the only fix is a site-wide relaxation; it also needs RTL workarounds.
- ECharts: large, with open RTL bugs.
- ApexCharts: restrictive licence and large.
- uPlot: no donut or touch support.
- Hand-rolled SVG: a permanent in-house charting surface.

## Consequences

- Positive: no security relaxation; native RTL tooltips and touch; one library for every chart type.
- Negative / trade-offs: a canvas needs its colours read from CSS and an LTR canvas for Persian labels; three styles triple the visual test surface (one test page per style, in both themes and both directions).
- Revisit when a needed chart type outgrows Chart.js, the CSP policy changes, or a style is dropped (its Users fall back to Soft).
