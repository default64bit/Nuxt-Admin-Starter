# Web Push and the admin PWA: Off and Removed

Browser push as a Notification Channel plus the installable admin app (ADR-0028, ADR-0029). Push is sent by the notification worker with VAPID through the `web-push` library; the admin installs per locale (`/admin` and `/en/admin`), and its service worker handles push, notification clicks and the app badge only (no `fetch` handler, no Cache Storage). The Inbox is the source of truth; nothing else depends on push.

## Off (no code change)

1. Leave `NUXT_VAPID_PUBLIC_KEY`, `NUXT_VAPID_PRIVATE_KEY` and `NUXT_VAPID_SUBJECT` empty. The Channel reads "not configured": no outbox rows are queued for it, the settings page shows it unavailable, and the "Browser push" card and the turn-on banner are hidden. Boot and readiness are unaffected.
2. Or keep the keys and set `NUXT_ADMIN_CHANNEL_PUSH_ENABLED=false` (the kill switch). The Channel reads "disabled".
3. Generate a key pair with `npx web-push generate-vapid-keys`; the subject is a `mailto:` address or an `https:` URL.

The PWA manifest and service worker stay available while push is Off, so the admin remains installable. Tests keep running against the `fake-push` fixture.

## Removed (delete it for good)

Do Off first, then delete the following.

**Files**

- Server: `server/notifications/push/` (adapter and config), `server/repositories/push-subscriptions.repository.ts`, `server/services/push-subscriptions.service.ts`, `server/api/v1/admin/account/push-subscriptions/`, `server/routes/admin/` and `server/routes/en/admin/` (manifest and worker routes), `server/utils/admin-pwa-handlers.ts`, `server/utils/device-label.ts`, `server/database/schema/push-subscriptions.ts` and its export in `server/database/schema/index.ts`.
- Shared: `shared/admin-worker/`, `shared/constants/admin-push.ts`, `shared/schemas/admin-push-subscriptions.ts`, `shared/utils/admin-push.ts`, `shared/utils/admin-pwa.ts`, `shared/types/admin-worker-source.d.ts`, `scripts/admin-worker/`.
- App: `app/composables/admin/useAdminPush.ts`, `useAdminPwa.ts`, `useAdminInstall.ts`, `app/components/admin/AdminPushHereCard.vue`, `AdminInstallCard.vue`, and the body of `AdminPushBanner.vue` (keep the empty mount point, see the admin shell spec).
- i18n: `i18n/locales/web-push-pwa.en.json` and `web-push-pwa.fa.json`, and their entry in `i18n/unapproved.md`.
- Static: the PWA and push icons in `public/icons/` (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `badge-96.png`); keep `apple-touch-icon-180.png` while `nuxt.config.ts` links it.

**Edits**

- `server/notifications/admin-channels.ts`: the push imports, and the registry returns `[]` (or the other Channels). Keep the optional `purge` member of the contract or drop it with the adapter.
- `server/workers/notification-worker.ts`: the `channel.purge` loop, if you dropped `purge`.
- `server/services/admin-notification-settings.service.ts`: `pushPublicKeyOf` and `vapidPublicKey`; `shared/schemas/admin-notification-settings.ts`: the `vapidPublicKey` field and `push` in the strict `channels` schema (and `"push"` in `ADMIN_CHANNEL_KEYS`).
- `shared/constants/admin-operations.ts`: the four `account/push-subscriptions` rows in `ADMIN_PREFERENCE_ROUTES`.
- `nuxt.config.ts`: the `bundleAdminWorker` import and the `#admin-worker-source` virtual module in the `nitro:config` hook.
- `app/layouts/admin.vue`: `useAdminPwa` and the nav-counts call feeding it. `app/components/admin/AdminUserMenu.vue`: `removeThisBrowserPush` in the sign-out. `app/pages/admin/account/notifications.vue`: `<AdminPushHereCard />` and `<AdminInstallCard />`.

**Environment**

- `.env.example` and `deploy/production.env.example`: `NUXT_VAPID_PUBLIC_KEY`, `NUXT_VAPID_PRIVATE_KEY`, `NUXT_VAPID_SUBJECT`, `NUXT_ADMIN_CHANNEL_PUSH_ENABLED`.
- `compose.yaml`: the same four keys in the `app` and `notification-worker` environments.

**Dependencies:** `web-push` and `@types/web-push` in `package.json`; run `pnpm install`.

**Tables and drop migration:** `push_subscriptions` lives in the baseline. Nothing is deployed from the Starter, so a Project that never deployed regenerates the baseline without it (ADR-0007). A deployed Project generates a migration with `just db-generate remove-web-push`, inspects it, and commits it; it must contain `DROP TABLE "push_subscriptions";`. The `push` value of the `notification_channel` enum and any `notification_outbox` or `notification_channel_preferences` rows for it are harmless to keep; delete those rows (`DELETE ... WHERE channel = 'push'`) in the same migration to clean up.

**Tests and fixtures:** `tests/unit/admin-worker/`, `tests/unit/notifications/push-config.test.ts`, `tests/integration/notifications/push-channel.test.ts`, `tests/integration/notifications/push-test-route.test.ts`, `tests/e2e/web-push-pwa.spec.ts`, `tests/fixtures/fake-push.ts`.

**CI:** no job is specific to this piece; the Vitest and Playwright jobs run unchanged once the files above are gone.

**Documentation:** the Web Push row of ADR-0029 and the push parts of ADR-0028 (record the removal as a superseding note), and this file.
