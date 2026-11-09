# ADR-0012: UI with Tailwind CSS v4 and shadcn-vue

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

The app uses Tailwind CSS v4 through `@tailwindcss/vite`, shadcn-vue through `shadcn-nuxt`, and Reka UI primitives. There is one visual surface: the admin panel plus a plain landing page and the sign-in page, all on the stock shadcn neutral look.

Keeping that look stock is deliberate. Replacing shadcn semantic tokens with a custom set, or copying primitive logic into custom components, would duplicate keyboard, focus and accessibility behavior and make upgrades harder. A Project that wants its own brand changes token values in one place, and the primitives, dialogs, popovers and toasts follow.

Light and dark mode raise a second constraint. The landing page is cached for every visitor (ADR-0013), so the `<html>` class cannot depend on a per-request cookie. Teleported content must follow the same mode as the page.

## Decision

### Styling and tokens

- Tailwind CSS v4 is the styling framework, wired through the Vite integration in `nuxt.config.ts`. The canonical stylesheet is `app/assets/css/tailwind.css`.
- Use CSS-first configuration (`@theme` / `@theme inline`) and CSS custom properties. Do not add a parallel `tailwind.config.*` token source unless a concrete integration requires it and the reason is documented.
- The stock shadcn semantic tokens (oklch values), `--radius`, `color-scheme`, the six status tone pairs (`neutral`, `info`, `progress`, `warning`, `success`, `danger`) and the chart style tokens (ADR-0025) have one canonical CSS definition. Tailwind aliases reference those variables. Avoid hardcoded hex colors and arbitrary one-off styling where a shared token or variant can express the design. A test guards against hex literals and font CDNs.
- Brand colors, font swap, status tones, section hues and the icon list are covered by the theming guide.

### Light and dark mode

- `@nuxtjs/color-mode` is the only mechanism. A static inline pre-paint script reads `localStorage` and sets `dark` on `<html>` (`classSuffix: ''`, no cookie, default preference `system`). One preference covers the whole app, switched by a two-state toggle in the user menu. Landing, sign-in and error pages follow the stored or system preference.
- Because the class is set before paint from the browser's own storage, cached HTML is identical for every visitor and the first paint is correct. Portals and the toaster inherit the mode from `<html>`, so overlays never leak the other mode.

### Fonts and direction

- Fonts are self-hosted through Fontsource (`@fontsource/inter`, `@fontsource/vazirmatn`) at weights 400, 500 and 600, with the font preload kept. No Google Fonts or other font CDN. `en` uses Inter; `fa` uses `"Vazirmatn", "Inter", ui-sans-serif, system-ui, sans-serif` through `html:lang(fa)`.
- Persian RTL and English LTR are supported throughout. Use logical properties (start/end) rather than left/right.

### shadcn-vue conventions

- Copy the nine upstream shadcn-vue `data-*` `@custom-variant` blocks into `tailwind.css` so state-styled primitives work, and set `rtl: true` in `components.json` before adding any primitive.
- `app/components/ui/` holds the shadcn-vue primitives managed by `shadcn-nuxt`. Admin-specific compositions in `app/components/admin/` build on them and do not copy their interaction logic.
- Use the existing class-variance-authority and class-merging patterns for repeated variants. A base primitive may change for a genuine accessibility or correctness issue, with an explanation and regression verification.
- Use the project's existing `@tabler/icons-vue` dependency by default rather than adding a competing icon package.
- A component showcase page or Storybook is not part of the Starter. Validate components on real pages and with the accessibility workflow (axe in the e2e specs).

## Consequences

- Positive: primitives keep their upgrade path, theme changes happen in one place, first paint is correct on cached HTML, and there is one theme source with no portal leaks.
- Negative: wrapper components must forward props, slots, events, focus and attributes correctly, and dark mode plus teleported overlays need testing wherever a new overlay appears.

## Verification

- A token test asserts no hex literals, no font CDN, Fontsource imports, the nine `data-*` variants and `rtl: true`.
- Each admin view passes axe in `fa` and `en`, and an RTL `dir` check, in its e2e spec.
