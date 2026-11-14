# admin-shell

Living spec. Requirements describe observable outcomes; scenarios are GIVEN / WHEN / THEN. Decisions behind them: the "Admin shell" and "Access" sections of `.specs/decision-log.md`, ADR-0012 (UI on stock shadcn tokens), ADR-0013 (private pages), ADR-0028 (Inbox and PWA mount points). Sign-in and the session policy are in `.specs/authentication/spec.md`; Users, Roles and the Permission catalogue are in `.specs/users-and-roles/spec.md`.

## Purpose

A signed-in User lands in one frame for the whole panel: a sidebar of the destinations they may open, a header with breadcrumbs, a user menu, and the page. The frame works in Persian (RTL, Jalali dates) and English (LTR, Gregorian dates), in light and dark mode, on a phone and on a desktop. Real pages (Dashboard, Users, Roles, Audit log, the Inbox) replace the placeholders the shell ships with, without touching the frame.

## Requirements

### Requirement: Every admin page lives in one shell

Every page under `/admin` and `/en/admin` MUST render inside the admin layout: a sidebar, a header and the page content in one `main` landmark. One route middleware on the `admin` parent route MUST cover the page and all its children; it MUST NOT test the path string. A page that throws MUST show an inline alert with a Retry action while the sidebar and header stay usable.

#### Scenario: A page throws

- **GIVEN** a signed-in User on an admin page
- **WHEN** the page throws while rendering
- **THEN** an alert "This page failed to load." with Retry shows in the content area, the sidebar and header remain, and Retry renders the page again

### Requirement: The menu shows only what the User may open

The menu MUST be built from the typed nav config (`shared/constants/admin-nav.ts`). An item MUST show only when its page exists in the router and the User holds the item's Permission; the Dashboard has no page key and shows for every signed-in User. A group with no visible item MUST NOT render a heading. Hiding an item is a convenience only; the server stays the authority.

#### Scenario: A User holding no page Permission

- **GIVEN** a User whose Roles grant none of `view-users`, `view-roles`, `view-audit-log`
- **WHEN** they open the panel
- **THEN** the menu shows the Dashboard and no group heading

#### Scenario: A User holding one Permission

- **GIVEN** a User whose Roles grant `view-users`
- **WHEN** they open the panel
- **THEN** the menu shows the Dashboard and, under "People", Users, and nothing else

#### Scenario: A Project adds a destination

- **WHEN** a developer adds a row to `ADMIN_NAV`, an icon, a hue, both labels and a page at the declared route name
- **THEN** the menu shows the item to Users holding its Permission, and the placeholder-pages test fails until the page, the icon and the page's `permission` meta all exist

### Requirement: A page the User may not open answers 403

A page MUST declare the Permission that opens it with `definePageMeta({ permission })`. A signed-in User who lacks it MUST get an HTTP `403` and the error page ("Access denied") with a link back into the panel, on first load and on in-app navigation. A guest never reaches the shell: the private-route guard sends them to sign-in. Every API route under `server/api/v1/admin` MUST call a guard (`requirePermission`, `requireAnyPermission`, `requireAllPermissions` or `requireSignedIn`) and answer 401 or 403 itself.

#### Scenario: Opening a page without its Permission

- **GIVEN** a User holding `view-users` but not `view-roles`
- **WHEN** they open `/en/admin/roles`
- **THEN** the response is `403`, the page says "Access denied", and the menu has no Roles item

#### Scenario: Opening the Dashboard

- **GIVEN** any signed-in User
- **WHEN** they open `/admin`
- **THEN** the Dashboard placeholder renders inside the shell

### Requirement: Section hues tint the page title

Each destination has a hue in `ADMIN_NAV_HUES`: Dashboard 200, Users 260, Roles 285, Audit log 350. The page header tints its icon tile with the hue of the section the page belongs to; a section without a hue MUST get the default hue (238). A page may pass its own `hue`.

#### Scenario: A section without a hue

- **GIVEN** a destination whose key is not in `ADMIN_NAV_HUES`
- **WHEN** its page renders a header
- **THEN** the icon tile uses the default hue

### Requirement: The user menu holds the account controls

The header MUST end with a user menu that shows the User's name (a generic label when both names are empty), a language submenu, a light/dark toggle, a link to the landing page and Sign out. Entries for pages other slices build (Notification settings, My account) MUST appear only once their page exists, through `ADMIN_USER_MENU_LINKS`.

- The language options MUST be real links to the same page in the other locale, keeping query and hash. The URL is the only source of the active language.
- The theme item MUST be a two-state toggle (light or dark). It MUST keep the menu open. The theme defaults to the system setting and is painted before the first frame (`@nuxtjs/color-mode`), so it never flashes.
- Sign out MUST end the session, then load the sign-in page with a "signed out" toast. If sign-out fails the User MUST stay in the panel with an error toast.

#### Scenario: Toggling dark mode

- **GIVEN** the system setting is light and the User opens the user menu
- **WHEN** they choose "Dark mode" twice
- **THEN** the page goes dark, then light, and the menu stayed open both times

#### Scenario: Switching language

- **GIVEN** a User on `/en/admin/users`
- **WHEN** they choose "فارسی" in the language submenu
- **THEN** they land on `/admin/users` with `lang="fa"` and `dir="rtl"`, in the same theme

#### Scenario: Sign-out fails

- **GIVEN** the logout request answers an error
- **WHEN** the User chooses Sign out
- **THEN** an error toast shows and they stay on the page

### Requirement: Persian is right-to-left with Jalali dates, English is left-to-right with Gregorian dates

`/admin/**` MUST render with `lang="fa"` and `dir="rtl"`; `/en/admin/**` with `lang="en"` and `dir="ltr"`. The sidebar sits on the start side (right in RTL, left in LTR), and on a phone it opens as a sheet from the same side. Dates MUST be formatted by `useAdminFormat` (`date`, `dateTime`): Jalali with Persian digits in `fa`, Gregorian with Western digits in `en`, in the business time zone. `AdminDateTimeInput` and `AdminDayInput` MUST show a Persian calendar in `fa` and a Gregorian one in `en` and store a Gregorian instant or day.

#### Scenario: Persian page

- **WHEN** a User opens `/admin`
- **THEN** the document is right-to-left and the sidebar is on the right

#### Scenario: A stored instant

- **GIVEN** the instant `2026-03-20T20:30:00Z`
- **WHEN** it is shown in `fa` and in `en`
- **THEN** it reads `۱ فروردین ۱۴۰۵` and `21 March 2026`

### Requirement: The shell passes accessibility checks in both locales

The shell, the user menu (open) and the phone sheet MUST have no axe violations (WCAG 2 A/AA and 2.1 A/AA) in `fa` and `en`, in light and dark mode. The sidebar has a labelled `nav`, the active item has `aria-current="page"`, and the sidebar toggle has an accessible name.

#### Scenario: Axe on the Dashboard

- **WHEN** axe scans `/admin` and `/en/admin`
- **THEN** it reports no violations

### Requirement: The Inbox has empty mount points

The shell MUST contain mount points for the Inbox slice, present and empty: `AdminInboxBell` in the header between the breadcrumb and the user menu, and `AdminPushBanner` under the header. They render no visible content and take no layout space (`display: contents`). The user menu is where the Inbox slice adds its install and push items. Nav badges and live alerts arrive with the Inbox slice; this slice has no nav-count request.

#### Scenario: Before the Inbox exists

- **WHEN** the shell renders
- **THEN** `[data-slot="admin-inbox-bell"]` and `[data-slot="admin-push-banner"]` exist and have no children and no text

### Requirement: Placeholder pages are trivial and replaceable

Dashboard, Users, Roles and Audit log MUST ship as placeholder pages that render `AdminPlaceholderPage` (a page header with the section icon and title). The slice that builds a feature replaces the page file and keeps its `permission` meta and nav key. The shell ships `AdminPageHeader`, `AdminForbiddenAlert`, `AdminSearchInput`, `AdminDateTimeInput`, `AdminDayInput`, `useAdminBreadcrumbs`, `useAdminCan`, `useAdminFormat`, `useCountUp` and `useUnsavedGuard` for those slices to build on.

## Constitution check

- II (everything authenticated except landing and sign-in): admin pages are in `PRIVATE_PAGES` (`/admin/**`); the route middleware only denies further.
- IV (security): the page Permission check is UX plus the HTTP 403; every API handler guards itself and an architecture test enforces it.
- III (accessible, RTL and LTR): logical properties, both locales and axe are covered by the shell e2e spec.

## Assumptions

- The session-ended notice stays the redirect to sign-in with a message (decision log, "Access"); the Source's non-dismissible dialog is not carried.
- Persian copy for the shell is a draft until the owner approves it (`i18n/unapproved.md`).
- "Notification settings" and "My account" menu entries are slots; the Inbox and My account slices add their rows and pages.
- Demo ticket destinations (hue 45) are added by the demo slice inside `demo-ticket` markers.
