// The live Inbox's position marker: the `(createdAt, id)` pair of an item, which orders the Inbox. Equal timestamps are
// told apart by id, so two items created in the same millisecond never collide. Wire form: `<ISO timestamp>_<uuid>`
// (neither part contains an underscore).

export interface InboxCursor {
  createdAt: Date;
  id: string;
}

const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function encodeInboxCursor(item: { createdAt: string | Date; id: string }): string {
  const createdAt = item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt;
  return `${createdAt}_${item.id}`;
}

/** The cursor behind a wire string, or null when it is malformed. */
export function parseInboxCursor(value: string): InboxCursor | null {
  const match = CURSOR.exec(value);
  if (!match) return null;
  const createdAt = new Date(match[1]!);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: match[2]!.toLowerCase() };
}
