# Nuxt Admin Starter

A copy-and-own starting point for admin panels and dashboards, so each new project begins with the shell, accounts, notifications and infrastructure already built instead of rebuilding them.

## Language

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
