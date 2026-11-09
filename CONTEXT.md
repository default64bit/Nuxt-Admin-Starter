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
