# ADR-0018: Code quality and git workflow

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Consistent code, machine-enforced boundaries and a small, reviewable history matter more when coding agents contribute alongside people.

## Decision

Tooling:

- ESLint through `@nuxt/eslint` (flat config, `eslint.config.mjs`) with stylistic rules; formatting is done by ESLint stylistic or Prettier, not both. Generated shadcn-vue primitives under `ui/` get the minimum rule relaxations needed to stay close to upstream.
- Architectural boundaries are enforced by tests and lint, not by convention: `app/` never imports `server/`, `shared/` imports neither, and routes do not import repositories (ADR-0005). The mechanical rules are covered by the existing architecture tests (ADR-0017).
- `nuxt typecheck`, lint and tests run in CI. Locally, `pnpm typecheck` and ESLint on changed files are the minimum before pushing.
- `.editorconfig` with LF line endings; `.gitattributes` with `* text=auto eol=lf`.

Git workflow:

- Two long-lived branches. Work lands on `develop`; `main` changes only by pull request, with the CI jobs as required status checks. Short-lived feature branches are optional. A Project that prefers trunk-based development edits the branch names in the workflows by hand.
- Commit subjects are short imperative sentences ("Add audit log filters"); the body says what and why and links the issue.
- Pull requests stay small, carry a checklist (tests, migrations, docs and ADRs updated, screenshots for UI) and are squash or merge reviewed.

## Alternatives considered

- Formatting with both Prettier and ESLint stylistic: two tools disagree.
- Mandatory commit-message linting: adds friction without changing outcomes for a small team.

## Consequences

- Positive: consistent code, boundaries enforced by machines, a readable history.
- Negative / trade-offs: strict checks can annoy until a team adapts.
