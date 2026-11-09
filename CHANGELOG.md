# Changelog

All notable changes to the Starter are recorded here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every merge to `main` is a Starter release tagged `vMAJOR.MINOR.PATCH` (MINOR for new or changed pieces with Port steps, PATCH for fixes). A Project records the release it has ported up to in `.starter-release`.

Each entry has a one-line summary, a link to the Starter PR, Area tags and ordered Port steps, written for a coding agent to apply by hand:

```markdown
- Summary in one line. ([#123](https://github.com/default64bit/Nuxt-Admin-Starter/pull/123))
  - Area: core | demo | media | glitchtip | telegram | web-push-pwa | backups | vps-deploy | caddy
  - Port:
    1. Ordered step to apply.
    2. Migration: yes | no.
    3. New env keys: none | `KEY`, `KEY`.
    4. Breaking: yes | no.
```

Entries sit under the Keep a Changelog headings (Added, Changed, Deprecated, Removed, Fixed, Security). A release PR to `main` moves the `Unreleased` entries into a `## [vX.Y.Z] - YYYY-MM-DD` section and bumps `.starter-release`; the `release-check` CI job rejects it otherwise.

## [Unreleased]
