# Nuxt Admin Starter

A copy-and-own starting point for admin panels and dashboards, so each new project begins with the shell, accounts, notifications and infrastructure already built instead of rebuilding them.

## Language

<!-- starter-meta:start -->

### Starter and projects

**Starter**:
This repository: the generic admin foundation that new projects are created from.
_Avoid_: template (as a noun for the code), boilerplate, framework

**Project**:
An application created from the Starter, which then owns and diverges its copy of the code.
_Avoid_: fork, downstream, consumer

**Source project**:
The private application the Starter's generic pieces are extracted from. Never copied with its history or its business logic.
_Avoid_: upstream, origin

**Starter release**:
A tagged version of the Starter whose changes are described for Projects to copy by hand. A Project records the Starter release it has caught up to.
_Avoid_: upstream version, Starter update

**Port note**:
The hand-applied instructions for bringing one change of a Starter release into a Project.
_Avoid_: migration guide, upgrade notes

**Optional piece**:
A part of the infrastructure or a Channel that a Project can turn **Off** (stops running, no code change) or have **Removed** (its code, services, settings and tables deleted) while everything else keeps working: media storage, error tracking, Telegram, Web Push, backups, server deploy and the web edge.
_Avoid_: feature flag, module, plugin, add-on

<!-- starter-meta:end -->

### Access

**User**:
A person who can sign in to the admin panel. Every user holds at least one Role; there is no account without admin access.
_Avoid_: shopper, customer, member, admin user, account

**Default admin**:
The one User created at first setup, who can never be disabled and always holds the Super role.
_Avoid_: owner, root, first admin

**Role**:
A named set of Permissions given to Users; a User's access is the union of their Roles' Permissions.
_Avoid_: group, profile

**Super role**:
The Role that always holds every Permission and can never be renamed, reduced or deleted.
_Avoid_: admin role, superuser

**Permission**:
One protected admin action or read, defined in code; never created or edited in the panel.
_Avoid_: right, capability, scope

**Session**:
A signed-in User's period of access to the panel. It ends after 30 minutes idle or 12 hours in total, when the User signs out, or when the User is disabled. Every User has the same session rules.
_Avoid_: login, token

**OTP**:
The one-time code sent by SMS to a phone number to sign in or to confirm a new phone number. It is valid for a short time with a limited number of attempts, is kept only while it is active, and is never logged, audited or placed in a payload.
_Avoid_: password, PIN, verification code

**Test code**:
The active OTP handed back to the sign-in form, only when the mock SMS adapter runs in a local or test environment, so development needs no SMS account.
_Avoid_: dev OTP

**SMS provider**:
The seam through which the application sends the OTP by SMS. It has a mock adapter (the default) and a Kavenegar adapter (shipped but off); nothing else sends SMS.
_Avoid_: SMS gateway, vendor (in code)

**Permission prerequisite**:
A Permission that another Permission cannot be held without (for example `manage-roles` needs `view-roles`). The server refuses a Role that breaks one.
_Avoid_: permission dependency, implied permission

### Demo domain

**Demo ticket**:
The single entity of the removable demo domain, which exists to exercise the list, card, board and dashboard views and to show how a Project adds its own domain.
_Avoid_: bare "ticket" for this entity (it collides with planning tickets on the issue tracker)

**Reference module**:
The demo domain's role as the copy-me example of a complete domain module, from schema to pages and tests.
_Avoid_: sample module, example feature

### Admin lists

**List view**:
One of the interchangeable presentations of the same admin list query: Table, Cards or Board. Choosing one never changes what is listed.
_Avoid_: mode, layout, display

**Board**:
A List view with one column per status, where an item moves to the next status by drag or by its action button, one step forward only.
_Avoid_: kanban, pipeline

### Dashboard

**Dashboard module**:
One card on the admin Dashboard that a User can add, remove, resize among its allowed sizes, and reorder. A User is offered only the modules whose data they may see.
_Avoid_: widget, tile, panel

**Dashboard layout**:
One User's own choice of Dashboard modules, their order, their sizes, whether each fills the space left in its row, and the date range each module shows. Each module appears in it at most once. It follows the User across devices; a new User starts from the default layout and may reset to it.
_Avoid_: dashboard config, workspace

**Needs attention**:
The Dashboard module, always first and never removable, that counts the work queues waiting now. A User sees only the queues whose pages they may open; each count matches that page's menu badge.
_Avoid_: alerts, to-do, inbox

**Chart style**:
One User's choice of how every admin chart is drawn: **Soft**, **Glow** or **Pro**. It changes only how charts look, never the numbers, and is separate from the light/dark theme.
_Avoid_: theme, skin, chart theme

**Analytics strip**:
The row of figures above an admin list page that summarises that page's records.
_Avoid_: KPI bar, stats header

### Notifications

**Notification**:
One item telling a User about work they may act on. It stays Open until that work is done, by anyone; each User has their own read state.
_Avoid_: alert, attention item, message

**Inbox**:
A User's list of the Notifications they may see, reached from the bell and its own page. It cannot be turned off.
_Avoid_: feed, notification center

**Channel**:
An outside way a Notification also reaches a User: Telegram or Web Push. Each User turns each Channel on or off; the Inbox is not a Channel.
_Avoid_: transport, provider (reserved for the SMS sender)

**Message language**:
The one language a User chooses for everything every Channel sends them, separate from the panel's language.
_Avoid_: notification locale

**Notification event**:
One kind of Notification, defined in code in the notification catalogue: its key, titles and copy in both languages, the Permission that gates it, an optional recipient, its link and its dedupe rule. A Project adds an event by adding a catalogue entry.
_Avoid_: alert type, trigger

**Outbox**:
The durable list of deliveries recorded in the same database transaction as the change that raises a Notification. The notification worker delivers them to Channels after the change commits, retrying with backoff and never delivering the same logical Notification twice.
_Avoid_: queue, message bus

**Notification worker**:
The separate process that reads the Outbox and delivers to Channels. A failure here never rolls back the change that raised the Notification.
_Avoid_: cron job, background job (in general)

### Audit log

**Audit event**:
One append-only record of an administrative change or a sensitive read: who did it, what it was, what it touched, when, and the outcome. The database refuses edits and deletes.
_Avoid_: log line, activity entry

**Action key**:
The stable `entity.verb` name an audit event carries (for example `demo_ticket.status_changed`). It is not a Permission key, and stored keys are never renamed.
_Avoid_: event type, permission

**Action group**:
The group an action key is filed under on the Audit log page (for example Users or Roles). An action key the page does not know is shown raw under "Other".
_Avoid_: category

**Event sentence**:
The one-line reading of an audit event on the Audit log page. Only some actions have one; the rest show their label and a change count.
_Avoid_: description, message

### Media

**Media object**:
The record of one uploaded image in the media registry: where it is stored, its type, size and dimensions, who uploaded it and for which purpose. It starts staged (uploaded and processed, not yet attached) and becomes attached when a record references it. Objects nothing references any more are removed by media cleanup.
_Avoid_: attachment, file record

### Rendering

**Shared-cached page**:
A public page served from the server cache whose HTML is identical for every visitor and never contains session data. The landing page is the only one.
_Avoid_: static page, prerendered page

**Private page**:
Any page served uncached with `no-store` and `noindex`, so it can show session data. Every admin page and sign-in is one.
_Avoid_: dynamic page
