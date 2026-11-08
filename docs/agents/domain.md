# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is single-context, but doesn't use a root `GLOSSARY.md`. It has its own equivalents:

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: the project's glossary. It defines domain terms and, for some terms, an `_Avoid_` list of synonyms not to drift into.
- **`.specs/decision-log.md`**: confirmed product decisions. Per `AGENTS.md`, this ranks above a stale spec sentence when the two conflict.
- **`docs/adr/`**: accepted architecture decision records for technical choices. Read ADRs that touch the area you're about to work in.
- **`docs/architecture.md`**: companion to the ADRs; shows the repository layout and dependency rules. If it disagrees with an ADR, the ADR wins and `docs/architecture.md` is the one that gets fixed.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront.

## File structure

Domain docs live at:

```
/
├── CONTEXT.md                 ← glossary (terms + _Avoid_ lists)
├── .specs/
│   ├── constitution.md        ← security requirements & core engineering principles
│   ├── decision-log.md        ← confirmed product decisions
│   └── <feature>/spec.md      ← feature specs
└── docs/
    ├── adr/                   ← accepted technical ADRs
    └── architecture.md        ← repository layout + dependency rules
```

There is no multi-context split (no per-package `GLOSSARY.md` or `docs/adr/`).

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to a synonym its `_Avoid_` list calls out.

If the concept you need isn't in `CONTEXT.md` yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag conflicts

If your output contradicts a confirmed entry in `.specs/decision-log.md` or an accepted ADR under `docs/adr/`, surface it explicitly rather than silently overriding. Per `AGENTS.md`'s conflict-resolution order, update the decision log/spec before implementation instead of guessing.
