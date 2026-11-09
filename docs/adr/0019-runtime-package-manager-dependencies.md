# ADR-0019: Runtime, package manager and dependencies

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Node version drift breaks tooling, because modern Nuxt and its dependencies require recent Node releases. Reproducible installs and a small, reviewed dependency set keep a Project maintainable.

## Decision

- **Runtime:** Node.js 24 LTS. `.nvmrc`, `.node-version`, the Dockerfile and CI all select Node 24. `engines.node` is `>=24.5.0 <25` and `.npmrc` sets `engine-strict=true`. The 24.5 floor exists because the Telegram Channel's optional Bot-API-only proxy needs the per-agent `proxyEnv` option of `node:https` (ADR-0021).
- **Package manager:** pnpm, pinned with the `packageManager` field and enabled through Corepack. `pnpm-lock.yaml` is committed and installs use a frozen lockfile in CI and Docker builds.
- **Install scripts** are controlled by the reviewed allowlist in `pnpm-workspace.yaml`; npm-only settings are not a substitute. Vitest stays on the major that matches the selected `@nuxt/test-utils` line.
- **`justfile`** is the documented interface for local orchestration, database preparation, checks, deploys and Compose operations. It calls the package manager through the repository pin and is backed by npm scripts that can also be run directly.
- **Dependency hygiene:** grouped automated updates; prefer fewer, well-maintained dependencies; check size, maintenance and license before adding one; remove unused ones. Framework-critical packages (`nuxt`, `drizzle-orm`, `drizzle-kit`) are upgraded deliberately, in dedicated changes with release notes reviewed.
- **SMS vendor:** the `SmsProvider` seam (ADR-0021) serves one-time passcodes only. The mock adapter is the default in local and test builds when `NUXT_SMS_PROVIDER` is unset. The Kavenegar adapter ships but is off. Production startup fails closed when sign-in needs an SMS provider and none is configured; choosing a vendor is an explicit Project decision, never a hidden default.
- **Cross-platform:** scripts in `package.json` are Node scripts or use `cross-env`, not shell-only syntax.

## Alternatives considered

- Floating Node majors: stale tooling and surprise breakage.
- npm or yarn: the lockfile format and install-script controls differ; pnpm is the Starter's single choice.

## Consequences

- Positive: reproducible installs, fewer "works on my machine" problems.
- Negative / trade-offs: contributors need Corepack and pnpm.
- Follow-ups: move to the next Node major when it enters LTS.
