// How an admin list shows its records (ADR-0027). Only the presentation changes: the page keeps the choice in
// memory (never the URL, storage or the server), every list opens as a table, and the list query is the same in
// every view. A list offers the Table plus Cards and, when its items have statuses, a Board.
export type AdminListView = "table" | "cards" | "board";

/** One labelled value on a card. `hint` is a muted second line; `ltr` keeps Latin text such as a code left to right. */
export interface AdminCardFact {
  label: string;
  value: string;
  hint?: string;
  ltr?: boolean;
}
