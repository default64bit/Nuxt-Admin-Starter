# Architecture Decision Records (ADRs)

An ADR captures one architecturally significant decision: the context, the choice, and the consequences. They are short, immutable once accepted, and live in the repo next to the code.

## How we use them

- One decision per file, numbered sequentially: `NNNN-short-title.md`.
- Copy `0000-template.md` to start a new one. Open it as a PR so the decision is reviewed, not just the code.
- Status flow: `Proposed` → `Accepted` → (`Deprecated` | `Superseded by ADR-NNNN`).
- Never edit an accepted ADR's decision. Write a new ADR that supersedes it and link both ways.
- Write an ADR when a choice is expensive to reverse, affects more than one area, or a new teammate would ask "why did we do it this way?".

## Index

|    # | Title                         | Status   |
| ---: | ----------------------------- | -------- |
| 0001 | Record architecture decisions | Accepted |
