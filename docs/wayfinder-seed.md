# Wayfinder seed (draft)

Draft input for `/wayfinder`. The map and its tickets live on this repo's GitHub Issues; this file only seeds them. Every ticket below is a **draft**: the wayfinder session may merge, split, retype or drop any of them.

---

## Map body

### Destination

An accepted spec for **starter v0** plus an extraction inventory, ready to be sliced into implementable tickets with `/to-spec` and `/to-tickets`.

### Notes

- **Source:** a private Nuxt 4 shop project, read-only. Its local path and snapshot commit are in `docs/local-source.local.md` (gitignored, on the owner's machine only). Read it with `git -C <path> show <commit>:<file>` or `git archive <commit>`. Never edit it, never touch its working tree, issues, labels or branches.
- **Extract only what is not business-specific.** Business logic (catalog, cart, checkout, orders, payments, wallet, discounts, promotions, reviews, refunds) stays behind.
- **Skills to consult:** `grilling` + `domain-modeling` for grilling tickets, `research` for research tickets, `prototype` for prototype tickets, `codebase-design` when deciding module seams.

Decisions already confirmed by the owner (2026-11-08):

| Topic | Decision |
| --- | --- |
| Distribution | GitHub template repo (not a Nuxt layer or package) |
| Stack | Same as source: Nuxt 4, Tailwind v4, shadcn-vue/Reka, Postgres + Drizzle, Zod, Vue Query, Pinia, @nuxtjs/i18n, nuxt-auth-utils, nuxt-security, Vitest, Playwright + axe, pnpm, Node 24, `just`, Docker Compose |
| Public surface | No storefront design system. A plain Nuxt landing page with a link to admin sign-in |
| Auth | Phone OTP with the mock SMS adapter behind the `SmsProvider` seam. Any other auth method is a per-project business decision |
| Locales | `fa` + `en`, RTL/LTR, Jalali/Gregorian |
| Demo domain | A removable "Tickets" module drives the table, card view, kanban, search/filter/sort/pagination and dashboard examples |
| Notifications | All of it: in-app inbox (polled), outbox worker, Web Push, admin PWA, Telegram bot |
| Infra | All of it (Compose, Caddy, RustFS media + image variants, GlitchTip, pull-based VPS deploy, backups), and each piece must be easy to replace or remove |
| Docs | Generalized accepted ADRs, 3–4 example specs (admin shell, authentication, roles/accounts, audit log), generalized constitution, decision log, `CONTEXT.md`, `AGENTS.md` |
| Agent skills | Third-party skills pinned in `skills-lock.json` and restored with `npx skills experimental_install`; not committed |
| Repo | Public, `default64bit/Nuxt-Admin-Starter` |

### Decisions so far

_(empty: filled as tickets close)_

### Not yet specified

- CI workflow shape for the starter (which jobs, sharding, a11y gate)
- Performance budgets and how they are measured
- Seed data strategy for the demo domain and the default admin
- Test suite selection: which source tests carry over and which get rewritten

### Out of scope

- Storefront design system, Figma token pipeline, shop pages
- Commerce domains: catalog, cart, checkout, orders, payments, wallet, discounts, promotions, reviews, refunds
- Auth methods other than phone OTP
- Distribution as a Nuxt layer or npm package; a CLI generator

---

## Draft tickets

| # | Title | Type | Blocked by |
| -: | --- | --- | --- |
| 1 | Extraction inventory | research (AFK) | — |
| 2 | Tickets demo domain | grilling | — |
| 3 | Generic permission catalogue and default roles | grilling | 1 |
| 4 | Generic dashboard module registry | prototype | 1, 2 |
| 5 | Notification event catalogue and channel toggles | grilling | 1 |
| 6 | Infra removability contract | grilling | 1 |
| 7 | Docs set: which ADRs, specs and principles ship | grilling | 1 |
| 8 | Setup / rename wizard scope | grilling | 2, 6 |

### 1. Extraction inventory

**Question:** For every admin-related file in the source snapshot (components under `app/components/admin/` and `app/components/ui/`, composables, layouts, middleware, pages under `app/pages/admin/`, `server/` modules, `shared/` schemas and utils, i18n files, tests, scripts, Compose/Caddy/deploy files, ADRs, specs), which bucket is it in: **generic** (copy as-is), **needs generalizing** (copy and strip domain terms), or **business** (leave behind)? Also: which dependencies does each generic piece pull in?

Output: an inventory file linked from the ticket, grouped by future slice.

### 2. Tickets demo domain

**Question:** What is the shape of the demo "Tickets" entity: its fields, statuses and kanban transitions, which list features it shows off (table, card view, kanban, search, filters, sort, pagination, drag-and-drop), which dashboard modules it feeds, and how it is removed cleanly (one folder? a script?).

### 3. Generic permission catalogue and default roles

**Question:** Which permissions and roles ship in the starter (accounts, roles, audit log, notifications, settings, demo tickets), what is the default-admin invariant, and how does a project add its own permissions?

### 4. Generic dashboard module registry

**Question:** How does a project register its own dashboard modules (data source, chart style, sample preview, size, ordering, per-admin layout), given that the source dashboard is wired to sales and order modules? Prototype the registry contract against the demo domain.

### 5. Notification event catalogue and channel toggles

**Question:** Which notification events ship (sign-in alerts, role changes, demo ticket events, test pings), how does a project declare new events, and how are channels (inbox, Web Push, Telegram, SMS) switched on/off per deployment and per admin?

### 6. Infra removability contract

**Question:** For each optional piece (RustFS + media pipeline, GlitchTip, Telegram, Web Push/PWA, backups, VPS deploy), what is the one supported way to switch it off or remove it: env flag, Compose profile, removal script, or deleting a folder? And what must keep working when it is gone?

### 7. Docs set

**Question:** For each source ADR (0001–0034) and spec, decide: ship as an accepted default (rewritten without business terms), ship as an example, or drop. Also decide the generalized shape of `.specs/constitution.md`, `.specs/decision-log.md`, `CONTEXT.md` and the full `AGENTS.md`.

### 8. Setup / rename wizard scope

**Question:** What does a new project's first-run setup do (app name, locales, removing the demo domain, switching off infra pieces, seeding the default admin), and is it a `just` recipe, a script, or a `wizard` skill walkthrough?
