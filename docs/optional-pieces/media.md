# Media storage (RustFS): Off and Removed

S3-compatible object storage (RustFS) for uploaded images, with staging, image variants and cleanup (ADR-0029, `.specs/media/spec.md`). The demo ticket's optional image is the first consumer. Everything is gated by configuration, so the app never depends on RustFS being present.

## How it works

- `POST /api/v1/admin/media?purpose=<purpose>` reads one raw image body with its own 10 MiB limit (no multipart parser), sniffs the real type, re-encodes it with `sharp` (JPEG, PNG or WebP, metadata stripped, longest side 2400 px) and stores it in the **private** bucket under a random `staging/` key. The purpose names the record the image is for and the Permission that gates the upload (`MEDIA_PURPOSE_PERMISSIONS` in `shared/constants/media.ts`).
- Saving the owning record (`applyOwnerImage`) checks the upload is the Actor's own, for that purpose, still unattached, then copies it to the **public** bucket under a random `images/` key. Replacing or removing an image leaves the old object for media cleanup.
- `GET /_media/<public key>?w=&h=&fit=&f=&q=` serves resized WebP/JPEG/PNG variants of public objects, cached in process.
- `just media-gc` (the `media-gc` job) deletes registry rows and objects that nothing references and that are older than 24 hours (`--older-than-hours=N`, `--dry-run`). Owners are registered in `MEDIA_OWNER_TABLES` (`server/repositories/media-owners.ts`).
- RustFS runs only behind the `media` profile. `storage-init` creates the buckets, the public-read policy on the public bucket and the app's least-privilege S3 identity; the root credentials (`RUSTFS_*`) reach only `rustfs` and `storage-init`.

## Off (no code change)

1. Remove `media` from `COMPOSE_PROFILES` and **empty the app identity keys** `NUXT_S3_ACCESS_KEY`, `NUXT_S3_SECRET_KEY`, `NUXT_S3_PRIVATE_BUCKET` and `NUXT_S3_PUBLIC_BUCKET` (and `NUXT_S3_ENDPOINT` for host runs). The access key is the on-switch: Compose gives the app the `rustfs` endpoint only while it is set. Storage is all or nothing; a partly set configuration is reported at boot.
2. `NUXT_PUBLIC_MEDIA_BASE_URL` may stay empty. In production leave `MEDIA_DOMAIN` empty too: the edge then serves no media host (`CADDY_MEDIA_SITE` stays empty and `ops/caddy/pieces/media.caddy` is not imported). The release guards require `MEDIA_DOMAIN` only while `media` is listed, and `just deploy` skips `storage-init`.
3. What the app does: it boots, `/api/health/ready` skips storage, `POST /api/v1/admin/media` and `/_media/**` answer "not configured" (`503 media_not_configured`), and `GET /api/v1/admin/media/status` says `enabled: false`. On Demo tickets the image field is disabled with a "storage not configured" hint, Cards thumbnails show a placeholder, and create and edit still work. Existing images stay referenced in the database.
4. Tests keep running without RustFS: they select the in-process fake store with `NUXT_S3_ENDPOINT=memory:` (refused in production).

## Removed (delete it for good)

Do Off first, then delete the following.

**Demo image touch-points** (all inside `demo-ticket` markers, so `just demo-remove` already removes them; delete them by hand if you keep the demo)

- `server/database/schema/demo-ticket.ts`: the `imageMediaObjectId`, `imageAltFa`, `imageAltEn` columns, the `demo_tickets_image_idx` index and the `demo_tickets_image_requires_alt` check (migration `0001_demo-tickets`).
- `shared/constants/media.ts`: the `demo-ticket-image` purpose and `DEMO_TICKET_IMAGE_PURPOSE`. `server/repositories/media-owners.ts`: the `demo-ticket` owner row.
- `shared/schemas/demo-ticket.ts` (`image`, `ownerImageShape`, `withOwnerImageRule`), `server/repositories/demo-ticket.repository.ts`, `server/services/demo-ticket.service.ts` (`applyOwnerImage`, the media lookup), and `storage` in the two write handlers under `server/api/v1/admin/demo-tickets/`.
- `app/components/demo-ticket/DemoTicketDialog.vue` (the `AdminImageField`), `DemoTicketThumbnail.vue` and its `#media` slot in `app/pages/admin/demo-tickets/index.vue`.
- `i18n/locales/demo-ticket.*.json`: `auditLog.fields.imageChanged`.
- The dev seed's image step: `server/database/demo-ticket-dev-seed.ts` (`hasDevImage`, the `storage` argument) and `scripts/db/demo-ticket-dev-seed.ts`.
- Tests and fixtures: `tests/integration/demo-ticket/demo-ticket-image.test.ts`, `demo-ticket-image-off.test.ts`, `demo-ticket-media-gc.test.ts`, `tests/e2e/demo-ticket-image.spec.ts`.

**Dependencies and code**

- `package.json`: `sharp` and `@aws-sdk/client-s3`, and the scripts `storage:ensure-buckets`, `storage:ensure-identity`, `storage:init`, `media:gc`. Run `pnpm install`.
- `server/utils/object-storage.ts`, `read-limited-body.ts`, `image-processing.ts`, `media-variant-handler.ts`; `server/services/admin-media.service.ts`, `owner-image.ts`, `media-gc.service.ts`, `media-variants.service.ts`; `server/repositories/media.repository.ts`, `media-owners.ts`; `server/jobs/media-gc.ts`; `server/routes/_media/`; `server/api/v1/admin/media.post.ts` and `server/api/v1/admin/media/`.
- `shared/constants/media.ts`, `shared/schemas/media.ts`, `shared/schemas/owner-image.ts`, `shared/utils/media-image.ts`; the `mediaBucketEnum` in `server/database/schema/enums.ts`, `MEDIA_BUCKETS` in `shared/constants/database-enums.ts`, and the `media` export of the schema index.
- `app/components/admin/AdminImageField.vue`, `app/utils/admin-upload.ts`, `app/composables/admin/useMediaStatus.ts`, and the `admin.media` keys of `i18n/locales/{en,fa}.json`.
- `server/utils/domain-errors.ts`: `tooLarge`, `unsupportedType`, `notDecodable`, `tooManyPixels`, `mediaInvalid`, `mediaNotConfigured`.
- `server/api/health/ready.get.ts`: the storage check and `checkStorage`; `server/utils/runtime-config-schema.ts`: the storage-key validation, `isStorageConfigured` and the `mediaBaseUrl` rule. `nuxt.config.ts`: `runtimeConfig.s3`, `public.mediaBaseUrl` and the `/api/v1/admin/media` route rule. `server/utils/csrf.ts`: the `POST /api/v1/admin/media` entry of `CSRF_BINARY_ROUTES` (ADR-0023). `shared/constants/admin-operations.ts`: the `POST media` preference row. `server/utils/csp.ts`: the media origin.

**Services and scripts**

- `compose.yaml`: the `rustfs`, `storage-init` and `media-gc` services, the `rustfs-data` and `rustfs-logs` volumes, the `NUXT_S3_*` and `NUXT_PUBLIC_MEDIA_BASE_URL` entries of `app` (and the `rustfs` and `storage-init` dependencies), and the `NUXT_S3_*` entries of `seed`. `compose.dev.yaml` and `compose.prod.yaml`: `storage-init`, `media-gc`, the `rustfs` mirror line, and on `caddy` the `MEDIA_DOMAIN`, `CADDY_MEDIA_SITE`, `NUXT_S3_PUBLIC_BUCKET` entries and the `rustfs` dependency.
- `scripts/storage/`; `justfile`: `storage-ensure`, `media-gc`; `scripts/ops/compose-check.mjs`: the `media` entry of `PIECE_SERVICES` and `media` from the piece profiles; `scripts/ops/release-lib.sh`: `rl_storage_init` and its call in `justfile` `deploy`; `scripts/ops/edge-guards.sh` and `autodeploy.sh`: the media-domain handling.
- `ops/caddy/pieces/media.caddy` and the media import line in the `Caddyfile`.

**Environment and CI**

- `.env.example` and `deploy/production.env.example`: the `RUSTFS_*`, `NUXT_S3_*`, `NUXT_PUBLIC_MEDIA_BASE_URL` and `MEDIA_DOMAIN` keys, and `media` in the `COMPOSE_PROFILES` comments. `tests/fixtures/compose-check.env`: the `RUSTFS_*` placeholders. `.github/workflows/ci.yml`: the `RUSTFS_*` values of the `all-off` job.
- `scripts/e2e/sharded.mjs` and `playwright.config.ts`: the `NUXT_S3_*` memory-store settings.
- `tests/fixtures/deploy-stub/compose.test.yaml`: the `storage-init` and `rustfs` stubs, and the `storage:init` expectation in `tests/infra/deploy-dry-run.test.ts`.
- Unit tests: `tests/unit/server/{image-processing,media-variants,read-limited-body}.test.ts`, `tests/unit/shared/media-image.test.ts`, `tests/integration/support/memory-storage.ts`.

**Tables:** `media_objects` and the `media_bucket` enum are in the baseline migration. Before any deploy, regenerate the baseline without them (keep the hand-written trigger block). After a deploy, add a migration that drops `media_objects` (after any table that references it) and `DROP TYPE media_bucket`. Stored objects live in the `rustfs-data` volume; remove it with `just dev-reset` locally.

**Documentation:** the media row of ADR-0029 (record the removal as a superseding note), `.specs/media/spec.md`, the Image section of `.specs/demo-tickets/spec.md`, and this file.

**CI:** no job is specific to media. `just compose-check` and `just test-compose` run unchanged once the entries above are gone.
