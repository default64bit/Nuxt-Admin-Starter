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

**Under construction.** The extraction is tracked on this repo's GitHub Issues (see [docs/wayfinder-seed.md](docs/wayfinder-seed.md)). The walking skeleton is in: toolchain, app foundation and a landing page in `fa` (RTL, default) and `en` (LTR). Features land slice by slice.

## Quick start

Needs Docker with Compose, [`just`](https://github.com/casey/just), and Node 24 (`.nvmrc`) with pnpm via corepack for the quality gates.

```bash
cp .env.example .env   # safe dummy values; set a real NUXT_SESSION_PASSWORD
just dev               # whole dev stack in Docker with HMR on http://localhost:3000
just install && just lint && just typecheck && just test && just build
```

`COMPOSE_PROFILES` in `.env` switches infrastructure Optional pieces on and off. See [local development and deployment](docs/architecture/local-development-deployment.md).

## Agent skills

Third-party agent skills are pinned in `skills-lock.json` and are not committed. Restore them with:

```bash
npx skills experimental_install
```

## Using the template

Instructions will be added once v0 is built.
