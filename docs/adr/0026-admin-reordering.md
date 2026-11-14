# ADR-0026: Admin reordering uses Pragmatic drag and drop with a Move menu

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Users reorder Dashboard modules in a wrapping grid of mixed widths, in RTL `fa` and LTR `en`. WCAG 2.2 SC 2.5.7 requires a single-pointer alternative to dragging. Reka UI's menu trigger opens on pointer-down, so it would swallow a drag that starts on it. Reordering exists only on the Dashboard grid; the demo Board moves items between status columns with the same library, which is not reordering.

## Decision

1. **`@atlaskit/pragmatic-drag-and-drop` 4.0.0** with `-hitbox` 3.0.0 and `-live-region` 2.1.0, at exact versions. `-auto-scroll` is added only if a long page needs it.
2. **One admin composable** maps the hitbox's physical closest edge to "before" or "after" using the container's `dir`.
3. **Every sortable item also has a visible Move menu** (to start, earlier, later, to end), a separate control from the drag grip. It is the keyboard path.
4. **Every move**, by drag or menu, is announced in the User's language through the live region.

## Alternatives considered

- `@dnd-kit/vue`: pre-1.0 and larger.
- SortableJS-based libraries: RTL grid bugs and no keyboard path.
- Hand-rolled native drag: repeats hitbox, touch and announcement work the library already does.

## Consequences

- Positive: small (about 10 KB); works in RTL and in a wrapping, mixed-width grid; one composable for any future sortable list.
- Negative / trade-offs: no keyboard dragging, the Move menu is the keyboard path; touch uses the browser's long-press; versions are pinned because entry paths changed across majors.
