# Media

Living spec for the media pipeline, an Optional piece (`media` profile, `docs/optional-pieces/media.md`). Terms (Media object, Optional piece) are in `CONTEXT.md`. The demo ticket image is the first consumer; its part is in `.specs/demo-tickets/spec.md`.

## Outcome

A User with the Permission of a record's purpose uploads one image, sees it staged, and attaches it when saving the record. Replaced or removed images are collected later. With media storage Off the app works without it.

## Data model

Table `media_objects` (baseline migration): `id` uuidv7, `bucket` (`private` | `public`), `object_key`, `mime_type` (JPEG, PNG or WebP), `byte_size` (1 byte to 10 MiB), `width`, `height`, `purpose` (text, a key of `MEDIA_PURPOSE_PERMISSIONS`), `uploaded_by_user_id` (FK `restrict`), `created_at`. `(bucket, object_key)` is unique. Records that carry an image reference `media_objects.id` with `restrict` and are listed in `MEDIA_OWNER_TABLES`.

## Requirements

### Requirement: Upload reads one raw body with its own limit

`POST /api/v1/admin/media?purpose=` takes the image bytes as the body (no multipart, no JSON). `401` without a session, `403` without the purpose's Permission, `400 validation_failed` for an unknown purpose, `413 too_large` over 10 MiB (checked on the declared length and while streaming), `415 unsupported_type` for an empty body or a type other than JPEG, PNG or WebP (sniffed from the bytes, never the claimed type), `422 not_decodable` or `too_many_pixels` (over 8000 px a side or 40 megapixels), `429 rate_limited` after 30 uploads a minute. The CSRF origin check applies; the route is the one binary exception (ADR-0023).

#### Scenario: A valid upload is staged
- WHEN a permitted User uploads a JPEG
- THEN `201` with `{ id, mimeType, byteSize, width, height, previewUrl }`, and the processed object sits in the private bucket under `staging/<uuid>.<ext>` with a registry row

### Requirement: Attaching promotes a staged upload

A save naming `imageMediaObjectId` with `imageAltFa` and `imageAltEn` (both required) attaches it only if it is the Actor's own upload for the record's purpose, still private and unattached, or already attached to that same record (a re-save). Anything else is `422 media_invalid`. The object is copied to the public bucket under `images/<uuid>.<ext>` inside the save's transaction and the staging copy is removed after commit. `null` removes the image; omitting the field leaves it.

### Requirement: Variants

`GET|HEAD /_media/<public key>?w=&h=&fit=&f=&q=` answers a resized image (WebP by default), cached for good (`immutable`). A key outside the public namespace or an unknown option is `400`; a missing object is `404`.

### Requirement: Cleanup

`just media-gc` deletes registry rows and stored objects that no owner references and that are older than 24 hours; a referenced object is never touched, a stored object that cannot be removed is reported and makes the job exit non-zero.

### Requirement: Off

With no storage configuration (all five `NUXT_S3_*` keys empty) the app boots, readiness skips storage, and `POST /api/v1/admin/media` (`503 media_not_configured`), `/_media/**` (`503`, plain text) and the preview route answer "not configured". `GET /api/v1/admin/media/status` answers `{ enabled, maxBytes }` to any signed-in User. A partly set configuration is reported at boot. `NUXT_S3_ENDPOINT=memory:` selects an in-process fake store outside production.

## Verification

- `tests/unit/server/{image-processing,media-variants,read-limited-body}.test.ts` and `tests/unit/shared/media-image.test.ts`.
- `tests/integration/demo-ticket/demo-ticket-image.test.ts` (upload limits and Permission, attach, variant, status), `demo-ticket-image-off.test.ts` (Off), `demo-ticket-media-gc.test.ts` (cleanup).
- `tests/e2e/demo-ticket-image.spec.ts`: attach in the dialog, the Cards thumbnail, axe and the layout direction in both locales.
