# Theming and branding

Branding a Project means editing the shadcn variables in one stylesheet, `app/assets/css/tailwind.css`, plus a short list of static files and messages. There is no separate branding mechanism, no theme switcher and no settings page (ADR-0012; the decision log "Admin shell"). The stock look is shadcn-vue's neutral palette in `oklch`, one surface for the landing page, sign-in and the admin panel.

Rules that hold while you brand: no hex colour in the stylesheet or a component (`tests/unit/architecture/tokens.test.ts` fails on one), no CDN fonts, status colours only from the six tones, and every change checked in light and dark, and in `fa` (RTL) and `en` (LTR).

## Brand colours

Everything colourful reads shadcn tokens, defined twice in `tailwind.css`: in `:root` (light) and in `.dark`. Change both.

| Token | What it colours |
| --- | --- |
| `--primary`, `--primary-foreground` | Primary buttons, selected states, the focus of most controls |
| `--secondary`, `--muted`, `--accent` (+ `-foreground`) | Secondary buttons, quiet surfaces, hover rows |
| `--background`, `--foreground`, `--card`, `--popover` | The page, cards and the portalled surfaces (dialogs, menus, selects, popovers) |
| `--border`, `--input`, `--ring` | Lines, field borders and the focus ring |
| `--destructive` | Destructive buttons and error text |
| `--sidebar*` | The admin sidebar and its active item |
| `--chart-1` to `--chart-5` | Chart series |
| `--radius` | The corner radius every component derives from |

Steps:

1. Pick the brand colour in `oklch(L C H)` and set `--primary` and `--primary-foreground` (and the `--sidebar-primary*` pair) in `:root`; choose lighter variants for `.dark`.
2. Keep text contrast at 4.5:1 or better against its background in both modes. The axe checks in e2e catch a failure.
3. Optionally tint `--accent`, `--secondary` and `--muted` toward the brand with a small chroma (`0.01` to `0.03`); leave the greys neutral if you want a calm panel.
4. Set `--chart-1` to `--chart-5` for both modes. The Chart styles (Soft, Glow, Pro) read these plus `--chart-glow-halo` and `--chart-pro-ring`.
5. Portalled content follows the active mode because it reads the same tokens; check a dialog and a select open in dark mode.

Also update these non-stylesheet colours, because browsers read them outside the CSS:

- `MANIFEST_COLOR` in `shared/utils/admin-pwa.ts` (the PWA `theme_color` and `background_color`; a manifest cannot read CSS variables).
- Nothing else carries a colour: the app name is text (below).

The app name is a message, `app.name` in `i18n/locales/en.json` and `fa.json`. It is the sidebar logo text, the page titles, the PWA name and the push notification title.

## Font swap and preload

Fonts are self-hosted through Fontsource, weights 400, 500 and 600 only. `en` uses Inter; `fa` uses Vazirmatn with Inter for Latin text inside it (`html:lang(fa)` in the stylesheet). To swap a family:

1. `pnpm add @fontsource/<new-font>` (and `pnpm remove` the old package if nothing else imports it, ADR-0019).
2. In `tailwind.css`, replace the three `@import "@fontsource/<font>/<subset>-<weight>.css"` lines at the top with the new family's 400, 500 and 600 files for the subset you need.
3. Update the font stacks: `--font-sans` in the `@theme` block (English) and in `html:lang(fa)` (Persian). Keep the generic fallbacks (`ui-sans-serif, system-ui, sans-serif`).
4. Update the preload in `app/composables/useFontPreload.ts`: it preloads only the **regular (400) woff2 of the active language**, imported as a `?url` from the package's `files/` directory. Point the two imports at the new regular files; keep preloading one font per page, because preloading unused weights wastes the first paint.
5. Never use a font CDN or a `@font-face` pointing at another host (`tokens.test.ts`, and the CSP allows only same-origin fonts).
6. Check text metrics in RTL and LTR, in the table, the sidebar and a dialog; line height and digit shapes differ by family.

A Project that serves only one language can remove the other family's imports, stack entry and preload import.

## Status tones

Status colours come from six tones only: `neutral`, `info`, `progress`, `warning`, `success`, `danger`. Each is a pair, a tinted background and its text colour, defined in `:root` and `.dark`:

```
--status-<tone>            tinted background
--status-<tone>-foreground text colour (AA, 4.5:1 or better, in both modes)
```

mapped to the Tailwind utilities `bg-status-<tone>` and `text-status-<tone>-foreground`. The hues are neutral (zero chroma), info 255, progress 300, warning 80, success 150 and danger 25; change a hue or lightness in both modes if the brand needs it and keep the contrast. `tokens.test.ts` requires all six pairs in both modes.

A domain **maps its own statuses to tones** in a typed constant and never adds a seventh tone or a hard-coded colour. The demo shows the pattern: `DEMO_TICKET_STATUS_TONES` in `shared/constants/demo-ticket.ts` (open `info`, in progress `progress`, resolved `success`, closed `neutral`), rendered by `app/components/demo-ticket/DemoTicketStatusBadge.vue` with full class names so Tailwind sees each one. Copy that badge for the new domain. Meaning goes beyond colour: the badge always carries the status text.

## Section hues and Dashboard module hues

Hues are plain numbers (0 to 360), used inside `hsl()` for soft tinted icon tiles and glows. They are not brand colours and are not status tones.

- **Section hues** (the admin pages' header icon tile, card list tint, sidebar item): the `ADMIN_NAV_HUES` record in `shared/constants/admin-nav.ts`, keyed by nav item key (Dashboard 200, Users 260, Roles 285, Audit log 350, demo tickets 45). A section without an entry gets `DEFAULT_ADMIN_HUE` (238). Add one line per section; choose hues that are far apart.
- **Module hues** (Dashboard cards): CSS variables in `tailwind.css`, `--dashboard-hue-<module-key>: <number>;` in `:root`, plus a rule `[data-dashboard-module="<module-key>"] { --dashboard-hue: var(--dashboard-hue-<module-key>); }`. Needs attention is 24, New accounts 100, the demo modules 215 and 190. `tests/unit/shared/dashboard-modules.test.ts` fails when a registered module lacks its variable.

Tint strengths are fixed in the components (`ADMIN_TINT_CLASS`, the module card) and already tuned for contrast in light and dark; change the hue, not the saturation, to rebrand.

## Icon replacement list

Neutral static icons and a text logo ship with the Starter, and there is no icon generator. Replace these files with the Project's own artwork, keeping the names and sizes:

| File | Size | Used by |
| --- | --- | --- |
| `public/favicon.ico` | 16, 32 and 48 px | Browser tab (`nuxt.config.ts` head links) |
| `public/favicon-32.png` | 32x32 | Browser tab |
| `public/icons/apple-touch-icon-180.png` | 180x180 | iOS home screen |
| `public/icons/icon-192.png` | 192x192 | PWA manifest, push notification icon |
| `public/icons/icon-512.png` | 512x512 | PWA manifest |
| `public/icons/icon-maskable-512.png` | 512x512, content inside the central 80% safe zone | PWA manifest (`purpose: maskable`) |
| `public/icons/badge-96.png` | 96x96, white glyph on transparent | Push notification badge |
| `public/logo-text.svg` | any width | The neutral text logo |
| `public/flags/fa.png`, `public/flags/en.png` | small | The language switch |

The sidebar logo is the per-locale `app.name` message with a monogram when collapsed, so a text-only brand needs no artwork. If you replace the Tabler icons used by the UI, `components.json` names the icon library (`tabler`); nav and Inbox icons are registered in `app/components/admin/admin-nav-icons.ts` and `app/components/admin/inbox-icons.ts`.

If the Web Push + PWA piece is Removed (`docs/optional-pieces/web-push-pwa.md`), the manifest and push icons go with it.

## Related

- The rule for adding sections, modules and statuses: [add-domain.md](add-domain.md)
- Why the UI is built this way: ADR-0012 (Tailwind v4 and shadcn-vue), ADR-0025 (Chart styles)
