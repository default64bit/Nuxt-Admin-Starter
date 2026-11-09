# ADR-0022: CSP by hashes for cached pages

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

`nuxt-security` defaults to `script-src 'strict-dynamic' 'nonce-{{nonce}}'` and mints one nonce per request inside the handler. A cached response would replay one nonce to every visitor, and the module's own hashing runs only during prerender. The landing page is shared-cached (ADR-0013), so a per-request nonce is unsafe. This ADR supplements ADR-0016, whose text stands.

## Decision

- `nonce: false` globally. One Nitro plugin (`server/plugins/csp.ts`) computes SHA-256 hashes of every inline `<script>` and `<style>` element in the rendered body, and the SRI `integrity` of external scripts and modulepreloads, and writes them into the CSP header of that same response. The plugin hooks `beforeResponse`, not `render:response`, because `nuxt-security` sorts its plugins after app plugins and its SRI plugin still rewrites the body on `render:response`; only `beforeResponse` sees the final bytes. A cached page is hashed again from the same cached body, so the policy always matches. `nuxt-security`'s own CSP header and nonce are disabled; its SRI plugin supplies the `integrity` values the hashes reference.
- Policy: `script-src 'self' 'strict-dynamic' <hashes>`, `script-src-attr 'none'`, no `'unsafe-inline'` or `'unsafe-eval'` in `script-src`. `style-src 'self' <style hashes>` with `style-src-attr 'unsafe-inline'` (Vue `:style` and Reka positioning; attributes cannot execute script). `img-src` also allows `blob:` for previews of locally picked files (the media field) and the origin of `public.mediaBaseUrl`. `connect-src` and reporting add the GlitchTip origin only when a DSN is configured. Fonts are `'self'`. `__NUXT_DATA__` and JSON-LD are data blocks, not CSP-governed. No third-party origin without a spec change.
- In dev the plugin omits `'strict-dynamic'` (Vite's scripts carry no integrity), allows runtime `<style>` injection and adds the Vite HMR websocket to `connect-src`.
- The policy is enforced, not report-only, in every environment. `report-uri` points at the GlitchTip security endpoint only when a DSN exists; a missing DSN never blocks startup, CI or readiness (ADR-0029).
- Tests: a per-route-class integration test (every inline hash is in the header, no `nonce-`, two requests to a cached route give an identical body and CSP); a Playwright `securitypolicyviolation` listener on the production build; a negative control that blocks an injected inline script; a unit test that `report-uri` exists only with a DSN.
- Implementers verify, not assume: how `nuxt-security` takes runtime-config origins (if it cannot, the plugin builds those directives), hook ordering, and that Nuxt's inline-script inventory equals what the integration test sees.

## Alternatives considered

- Nonces for private pages and hashes for cached pages: a route accidentally moved to the cache would silently replay a nonce.
- Report-only CSP: delays real protection.

## Consequences

- Positive: no per-request secret to leak; the static color-mode script and `window.__NUXT__` need no build-time hash pinning.
- Negative / trade-offs: a custom render-time plugin to maintain; `style-src-attr 'unsafe-inline'` is a documented relaxation.
