# Working on the Starter

This document is for people and coding agents changing the Starter repository itself. It is not part of a Project: `just first-run` deletes it, and `just first-run` refuses to run once it is gone. If you are building a Project, ignore it and read `AGENTS.md` instead.

## What the Starter is

A public GitHub template repository holding the generic admin foundation: phone OTP sign-in, an admin shell with RTL and LTR, users and roles, an audit log, a notification Inbox with Channels, a customizable Dashboard, list views, media uploads and a Docker Compose stack. A developer creates a Project from it with "Use this template", runs `just first-run`, and owns the resulting copy.

## The boundary test

A piece ships in the Starter only if an unrelated admin app (an HR tool, a helpdesk) would use it unchanged apart from names.

The test covers everything in the repository: code, schema, migrations, i18n keys and messages, tests, fixtures, seeds, specs, ADRs, the decision log, the glossary, comments and docs. A piece with no consumer in the Starter is dropped, and a Project harvests it back if it needs it. Ask of every file you add: would the HR tool keep this exactly as it is? If it needs a rename or a removal of business wording to pass, fix that before it lands, not afterwards.

The demo ticket domain is the only deliberate exception to "no domain content". It is generic, removable with `just demo-remove`, and wrapped in `demo-ticket` markers so removal leaves every remaining test passing.

## Copy-and-own

A Project owns its copy of the code from the first commit. There is no package to upgrade, no subtree, no shared remote and no automatic sync. The Starter evolves, and a Project brings a change in by hand:

- Every merge to `main` is a **Starter release**, tagged `vMAJOR.MINOR.PATCH`.
- Each release has a section in `CHANGELOG.md` with a one-line summary, a link to the Starter PR, Area tags and ordered **Port steps** (migration yes/no, new environment keys, breaking yes/no).
- A Project records the release it has caught up to in the one-line `.starter-release` file and reads the Port notes of every later release.

Keep changes easy to port: small, one area per PR, with migrations and environment keys called out. Do not rely on a Project having the demo or any single Optional piece.

## Harvest-back PRs

A Project that builds something generic can bring it back. Open a Starter PR by hand against `develop` with the code copied in and renamed. It must pass the boundary test, carry its tests, specs, ADR or decision-log entries where they apply, and add a changelog entry with Port steps. Nothing from the Project's business logic, data or history comes with it.

## No history from the Source project

Generic pieces were extracted from a private application, called the **Source project** in the glossary until the v0 release. Code moved by copying files from a pinned snapshot, file by file, with commerce and other business code left behind. There was no subtree, filter-repo, cherry-pick or remote, and no history was carried over. Do the same for any later extraction: copy, generalize, commit as new work.

## Public-artifact rule

This repository is public. Never commit, in any file, issue, PR, commit message or comment:

- local filesystem paths of any machine or other project;
- code excerpts, file listings or identifiers copied from a private project;
- secrets, tokens, keys, real phone numbers or other personal data;
- business data or business wording of any application.

Issues and PRs may describe behavior in neutral terms. Before pushing, check that new text contains none of the above. Secret scanning runs in CI.

## Workflow

- Work is pushed straight to `develop`. Do not create feature branches.
- `main` changes only through a develop-to-main pull request, and every such merge is a release.
- Specs, the decision log, the glossary and ADRs change with the code they describe. Starter-only text in shared files is wrapped in `starter-meta:start` / `starter-meta:end` markers so `just first-run` strips it.

## Starter-only parts

These exist only in the Starter and are removed by `just first-run`:

- This document, `CHANGELOG.md` and `scripts/starter/` (the release check script and `first-run`). The `.starter-release` file stays: in a Project it is the record of the Starter release it has ported up to, starting at the release the Project was created from.
- The AGENTS.md section "Working on the Starter itself" and the CONTEXT.md section "Starter and projects".
- The README, replaced by a short Project stub. `LICENSE` is untouched.
- Starter-only tests, all in `tests/starter/` (marker, rename, strip, `demo-remove` and `.starter-release` fixtures) and the Starter-only CI jobs: `first-run`, which runs `just first-run` with the demo removed and everything Off and then typecheck, lint, unit tests, build with the chart-chunk check and integration tests; and `release-check` and `release-tag`, described below. These two live in `.github/workflows/starter-release.yml`, a workflow that exists only in the Starter and is deleted whole, so that they stay out of `ci.yml`, which release-images calls. The release workflow's Deployment step is skipped in the Starter by a marked condition.

## What `just first-run` does

`just first-run name-en=… name-fa=… slug=… demo=keep|remove profiles=… push=on|off` (script `scripts/starter/first-run.ts`) refuses when this document is gone. In order: `demo-remove` when `demo=remove`; rename (the slug, the repository reference from `git remote get-url origin`, the GHCR image path and both display names read from the i18n `app.name`; `CHANGELOG.md` is excluded and files named after the slug, such as the systemd units, are renamed); the chosen `COMPOSE_PROFILES` and Web Push kill switch into `.env.example` and `deploy/production.env.example`, printing the removal-checklist paths of the Off pieces; `.env` from `.env.example` with fresh secrets and the optional `admin-phone`, `admin-given-name`, `admin-family-name` (local only); then the `starter-meta` strip, the deletion of the Starter-only paths and the README stub. Arguments left out are asked for only on a terminal. `rename`, `profiles`, `env` and `strip` also run alone: `just first-run rename name-en=… name-fa=… slug=…`.

## Release checklist

1. Make sure `develop` is green in CI: `checks`, `integration`, `deploy-automation`, `security`, `e2e`, `all-off` and `first-run`.
2. Decide the version. MINOR when the release has pieces with Port notes, PATCH for fixes. Stay on 0.x until the owner decides otherwise.
3. Move the `Unreleased` entries of `CHANGELOG.md` into a new section headed `## [vX.Y.Z] - YYYY-MM-DD`, and leave `Unreleased` empty (an HTML comment is fine). Every entry carries its summary, PR link, Area tags and Port steps.
4. Bump `.starter-release` to the new version, past the latest tag. Between releases it holds the upcoming version (`v0.1.0` until the first release is cut), so after a release it equals the latest tag until the next bump.
5. Open a develop-to-main PR containing both changes. `release-check` verifies that `.starter-release` is newer than the latest tag and that a matching changelog section exists with `Unreleased` emptied. Run the same check locally with `node scripts/starter/release.ts check` (the tags must be fetched).
6. Merge the PR. `release-tag` (both jobs are in `.github/workflows/starter-release.yml`) creates the annotated tag from `.starter-release` on the merge commit and fails if the tag already exists. A tag pushed with the workflow token starts no other workflow; the release image workflow already runs on the push to `main`. Released tags are protected from deletion and update by a repository ruleset.
7. **At the first release (`v0.1.0`):** delete the "Source project" term from `CONTEXT.md`, and any wording that refers to the extraction, before the release PR merges.
8. Confirm the release images were built and that no Deployment was queued from the Starter.

If any CI job is red, do not release.
