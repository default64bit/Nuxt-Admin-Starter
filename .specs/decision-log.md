# Product decision log

This file is the source of truth for confirmed product decisions. A recommendation is not approved until the product owner confirms it. Coding agents MUST NOT silently invent behavior for a genuinely unresolved business rule: record the question here or raise it, and wait for a confirmed answer.

A Project inherits this log as its starting set and appends its own decisions under the matching topic, or a new topic section. Decisions describe observable behavior and the rule behind it; technical choices belong in `docs/adr/`.

Last updated: 2026-11-09

## Confirmed decisions

### Access

- There is one kind of account: a User who can sign in to the admin panel. Every User holds at least one Role. There is no public or end-user account type, and no promote or demote action. Offboarding a person means disabling their User. Accounts are never deleted.
- Users are created only inside the panel, by someone holding `create-users` and `manage-roles`, with at least one Role. Signing in with an unknown phone number gets the same generic response a known number gets and creates nothing.
- Sign-in is by phone number and a one-time code sent by SMS. There are no other sign-in methods.
- One session policy applies to every User: it ends after 30 minutes idle or 12 hours in total. A User whose session ended is sent to sign-in with a clear message.
- Every page except the landing page and sign-in requires sign-in. The public surface is a plain landing page with a link to admin sign-in.
- The SMS provider seam serves the one-time code only. The mock adapter is on by default and a Kavenegar adapter ships but is off. Admin SMS and email are reserved Channel keys with no adapter.
- The production seed creates the `super` Role and then one Default admin from environment settings. There are no other preset Roles.
- The Default admin is exactly one account, seeded once. Later changes to the default-admin environment values never alter the existing account. It is never disabled and never loses `super`. If the default-admin phone is not set, the seed warns, skips and retries on the next run; it never blocks a deploy.
- Only a User holding `super` may grant, remove or act on the `super` Role. Nobody may disable themselves or change their own Roles. `super` is never renamed, reduced or deleted, enforced in the service and by a database trigger.
- Permissions are defined in code and never created or edited in the panel. The catalogue has nine keys in four groups: users (`view-users`, `create-users`, `edit-users`, `disable-users`), roles (`view-roles`, `manage-roles`), audit (`view-audit-log`) and demo tickets (`view-demo-tickets`, `manage-demo-tickets`).
- Permission prerequisites: the user actions need `view-users`; `manage-roles` needs `view-roles`; `manage-demo-tickets` needs `view-demo-tickets`. A save that breaks one is refused with `422 permission_prerequisites`.
- The seed reconciles the catalogue add-only: it inserts new keys and grants every key to `super`. Removing a key is a documented hand-written migration.
- The Inbox, Notification settings, the Dashboard and My account have no page key. Their items and modules are gated by catalogue keys.
- A User without a Permission sees the menu entry hidden, and a request to the page or action is denied with a clear 403.
- My account is a page in the user menu where a User edits their own name and changes their phone through a one-time code sent to the new number.
- Every audit event is append-only at the database level. A Project adds audit events for its domain through the audit catalogue.

### Admin shell

- The shell has a sidebar, a header, a user menu and section hues. Persian (RTL, Jalali dates) and English (LTR, Gregorian dates) are both supported, and `fa` is the default locale, changeable in one documented config line.
- Light and dark mode is a two-state toggle in the user menu. It defaults to the system setting and is applied before first paint so the theme never flashes. The landing, sign-in and error pages follow the stored or system preference.
- Persian text uses Vazirmatn with Inter for Latin text inside it; English uses Inter. Fonts are self-hosted, never loaded from a CDN, in weights 400, 500 and 600.
- Branding is done by editing the shadcn variables in one stylesheet, guided by the theming guide. There is no separate branding mechanism.
- Status colours come from six tones: neutral, info, progress, warning, success and danger. A Project maps its own statuses to them.
- Each admin section has a hue (Dashboard, Users, Roles, Audit log, Demo tickets); each Dashboard module has a hue of its own. A section without one gets the default hue.
- Neutral static icons and a neutral text logo ship, with a list of files to replace. There is no icon generator.
- There is no admin settings page. The app name, icons and default locale live in i18n messages, static files and config. A new setting lives in the environment, in code, in a database singleton or per User, following the "where a setting lives" rule in the add-domain guide.
- The app name comes from the per-locale app name in the i18n messages and names the panel, push notifications, the PWA and banners.
- Every view passes axe checks in both locales.

### Lists

- A list page can switch between Table, Cards and Board without changing what is listed. The chosen view lives in page memory only.
- Lists search by the normalized title, filter by the domain's own fields, and page 20 items at a time with Previous and Next. Items are newest first. There is no column sorting and no page-size selector.
- On the Board, a User with the manage Permission moves a card exactly one status forward by drag or by its action button. The move shows at once and refetches when someone else changed the item first (`409`). Moves are announced in a live region.
- A User without the manage Permission sees the same Board without grips or move buttons.
- Each Board column has "Show more" in steps of 20. On small screens the columns become a carousel that respects reading direction.
- Create and edit share one form dialog. Delete is a hard delete behind a confirm alert-dialog. A row or card opens the edit dialog, and a link with the item in the URL opens it directly. There is no detail page.
- The users list has an Analytics strip: accounts created in the last 30 days with a sparkline and change, the total, and the disabled count.

### Dashboard

- Each User has a Dashboard layout of modules they can add, remove, resize among the module's allowed sizes, reorder by drag, and give a date range. It is saved per User and follows them across devices. A new User starts from the default layout and can reset to it.
- A User is offered only the modules whose data they may see. Modules are chosen from a picker with sample previews.
- Needs attention is always first, cannot be removed or moved, and lists the queues waiting now. A User sees only the queues whose page they may open, each count equals that page's menu badge, and the module hides itself when no row is visible.
- The shipped modules, in default order, are Needs attention (with one Open demo tickets row), Demo tickets by status, Demo tickets created per day and New accounts.
- A User chooses a Chart style (Soft, Glow or Pro) for every chart. It changes only how charts look, never the numbers, and is separate from light and dark mode.
- A saved layout that names a removed module repairs itself: unknown keys are dropped on read and the layout is saved on the next Save. Removing a module needs no migration.
- Each module answers in 300 ms or less at p95 at the Project's planned scale, checked by hand before release. The fix order is an index first, then a rollup.
- The chart code loads lazily and only when a chart scrolls into view.
- A Project adds a module through a registry entry, a payload schema, a loader, a component, a colour variable and an `fa` and `en` title. A completeness test fails when a piece is missing.
- The reports framework (report pages and runner) is not part of the Starter. A Project harvests it back if needed.

### Notifications

- A Notification tells a User about work they may act on and stays Open until that work is done, by anyone. Each User has their own read state.
- The Inbox is reached from the bell and its own page, polled while the panel is open. It cannot be turned off.
- Every Notification reaches the Inbox and also each Channel (Telegram, Web Push) the recipient has on. There is no per-event Channel choice.
- A Notification can name one recipient User. Then only that User sees it and receives it on Channels, and only while they hold its gating Permission. Without a recipient, everyone holding the gating Permission sees it.
- Each User turns each Channel on or off (default on) and chooses one Message language (default `fa`) on the Notification settings page.
- A Channel reads "not configured" when its keys are missing. It has an environment kill switch, and a circuit breaker that opens after 10 transient failures or one credential failure and probes again every 5 minutes.
- "Send test notification" goes to the current browser only, at most once per 30 seconds, and creates no Inbox item, outbox row or audit entry. The Telegram bot answers `/status`.
- A User can install the admin panel as a PWA.
- Nav badges come from the nav-count service: the Inbox unread count and one named count per queue, gated by the queue page's key.
- A notification token never carries free text a User typed, because tokens reach Telegram and push.
- A Project adds a notification event through a catalogue entry. A completeness test fails when a field, translation or icon is missing.
- Removing a Channel from a Project is a documented checklist, not a recipe.

### Demo ticket

- The demo domain is a removable ticket entity that doubles as the Reference module. It has a title (required, at most 200 characters), an optional plain-text description, a status, a priority (`low`, `normal` or `high`), an assignee (a User or nobody) and one optional image with `fa` and `en` alt text. It has no display number, tags or comments.
- Tickets move forward only, `open` → `in_progress` → `resolved` → `closed`, one step at a time, with no reopening. Status tones are open → info, in progress → progress, resolved → success, closed → neutral.
- A "waiting long" chip shows on tickets open for more than 24 hours or in progress for more than 48 hours.
- Creating and editing a ticket needs `manage-demo-tickets`; viewing needs `view-demo-tickets`.
- The image is shown in the edit dialog and as a Cards thumbnail. When media storage is Off, the image field is disabled with a "storage not configured" hint, thumbnails fall back to a placeholder, and create and edit still work. Deleting or replacing an image leaves the old object for media cleanup.
- Demo changes are audited: created, updated (with assignee and priority before and after), status changed and deleted.
- Changing the assignee to someone other than the actor raises "Demo ticket assigned to you" for the new assignee; assigning yourself raises nothing. Each assignment is its own Notification. It closes itself when the ticket is resolved or closed, reassigned (including to nobody) or deleted. Its link opens the list with that ticket's dialog.
- The dev seed adds about 40 tickets across every status, priority and assignee (about a quarter with images) and about 3 dev Users. It never runs against production or test databases.
- The demo is removed with `just demo-remove`, which deletes every demo file and marked block. Before any deploy it also drops the demo migration. With `deployed=true` it keeps the migration and generates a normal drop migration. Every remaining test passes after removal.

### Infra

- There are seven Optional pieces: media storage, error tracking, Telegram, Web Push with the PWA, backups, VPS deploy and the edge proxy. Each can be turned Off with no code change, or Removed by following its checklist.
- One `COMPOSE_PROFILES` list (`media`, `monitoring`, `edge`, `backup`) switches the infrastructure pieces Off. Every recipe, the Compose check, the release guards and the deploy read it. Telegram and Web Push use their kill switches.
- Missing configuration for any piece means "not configured", never a boot failure. The application boots with every Optional piece Off.
- With media Off, the app boots without storage config, readiness skips storage, upload and variant routes answer "not configured" and the image field is disabled.
- With the edge proxy Off, the Project brings its own proxy and the app port is published.
- Error tracking sends server and client errors to GlitchTip when a DSN is set and nothing when it is not. It captures errors only, with no tracing or replay.
- Backups run nightly as a database dump to an off-host S3-compatible bucket and keep 14 daily copies. `just backup-now` and `just backup-restore <key>` (into a scratch database) ship with a documented restore drill. Media is not backed up.
- Production images are built once per commit in CI and pushed by SHA. The VPS pulls and deploys the newest queued release by itself, runs migrations and seeds, switches, health-checks and reverts automatically on failure. `just rollback`, `release-status` and `prune-images` ship too.
- The edge proxy terminates HTTPS with automatic certificates for the app, media and error-tracking hosts.
- A documented MSS clamp unit ships off by default, for a bad uplink that stalls TLS.
- The whole dev stack runs in Docker with `just` recipes and hot reload.
- The only performance check in CI is the chart chunk: chart.js, vue-chartjs and the chart helpers form one lazy chunk of at most 75 KB gzip and never sit in the entry chunk.
