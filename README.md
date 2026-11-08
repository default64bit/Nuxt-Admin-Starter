# Nuxt Admin Starter

A template for Nuxt projects that need a production-grade admin panel and are built with coding agents.

It is being extracted from a real Nuxt 4 shop's admin, keeping only what is not business-specific:

- Architecture and folder layout, layered server (handlers → services → repositories)
- i18n (`fa` + `en`, RTL/LTR, Jalali/Gregorian) and accessibility tooling
- Phone OTP authentication (mock SMS adapter), roles and permissions, accounts, audit log
- Admin shell: sidebar, top bar, mobile navigation, appearance and language switches
- shadcn-vue based UI with admin compositions: tables, card view, kanban, search, filters, sort, pagination
- Customizable dashboard with charts
- Notifications: in-app inbox, outbox worker, Web Push, admin PWA, Telegram bot
- Infrastructure: Docker Compose, Caddy, RustFS media, GlitchTip, pull-based VPS deploy, backups (each removable)
- Agent-facing docs: `AGENTS.md`, ADRs, specs, decision log, glossary

## Status

**Planning.** The extraction is being mapped with the `wayfinder` skill on this repo's GitHub Issues. See [docs/wayfinder-seed.md](docs/wayfinder-seed.md). There is no application code yet.

## Agent skills

Third-party agent skills are pinned in `skills-lock.json` and are not committed. Restore them with:

```bash
npx skills experimental_install
```

## Using the template

Instructions will be added once v0 is built.
