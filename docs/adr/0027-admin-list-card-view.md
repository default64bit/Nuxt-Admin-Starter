# ADR-0027: Admin list card view is a presentation-only switch held in page memory

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Admin lists show their records as a Table, as Cards and, where items have statuses, as a Board, switchable at any time, with only the presentation changing, no saved preference and the Table as the default. Lists are server-driven: the URL holds search, filters and the page, a Vue Query request returns 20 rows, and `ui/data-table` draws them with a Previous/Next footer (ADR-0011, ADR-0012).

## Decision

1. **The view is page state, not list state.** Each page holds `ref<AdminListView>("table")`. It is not in the URL, browser storage, Pinia or the server. The list query, its key and the URL stay identical in every view, so switching sends no request and cannot change what is listed.
2. **One switch, from a shadcn-vue primitive.** `components/ui/toggle` and `toggle-group` come from the shadcn-vue CLI; `AdminViewSwitch.vue` wraps a single-choice `ToggleGroup` and ignores the empty value Reka emits when the chosen item is clicked again, so one view is always chosen. Fonts stay self-hosted (ADR-0012), so any font `@import` the CLI adds is removed.
3. **One list container, three card shapes.** `AdminCardList.vue` takes the page's rows, total, page size and `v-model:page`, renders a `ul` of cards from a scoped slot, the page's own "no results" content, and the existing `DataTablePagination` footer. The section hue (`--admin-hue`) is set once on the list so card media tiles match the page icon. The shapes are a one-line row card, a stat card (headline number, optional whole-card link) and a tile card (picture on top); labelled values use a `dl`. They hold no data logic: each page maps its rows to card props and reuses its row-actions component.
4. **The image comes from the list query.** The demo ticket list joins the media object the same way the edit dialog does and returns the image as a public URL, never a storage key. The Cards view shows it as a thumbnail, with a neutral placeholder when media storage is Off or the ticket has no image (ADR-0029). The Table and Board do not show it.

## Alternatives considered

- `?view=cards` in the URL: shareable, but the preference is not meant to be kept and pages rebuild their query on every change.
- `localStorage`: a saved preference by another name.
- One generic card driven by a field schema: the shapes differ in structure; three small components with slots are clearer.
- Hand-rolled pressed buttons: duplicate Reka's roving focus and pressed-state semantics.

## Consequences

- Positive: the switch cannot alter list behavior; no persistence or API change beyond the image field; another list adopts it with one `ref`, the switch and an `AdminCardList` block.
- Negative / trade-offs: each page keeps a table definition and a card template side by side, so a new column goes in both; the empty-state content appears in both slots.
- Follow-ups: if a Project wants the choice remembered, a per-viewer convenience such as `localStorage` supersedes decision 1 with a new ADR.
