// The one function that turns a stored change summary into rows (.specs/audit-log/spec.md "Details panel"). The
// list's `changeCount` is the number of rows it returns, so "N changes" always equals the rows a panel shows.
// It understands the shapes the Starter writes (`{ old, new }` pairs, `{ added, removed }` lists and plain values);
// anything else becomes one plain row.
export type ChangeRow =
  | { kind: "change"; field: string; key?: string; from: unknown; to: unknown }
  | { kind: "value"; field: string; value: unknown }
  | { kind: "added" | "removed"; field: string; value: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isFromTo = (value: unknown): value is { from: unknown; to: unknown } => isRecord(value) && "from" in value && "to" in value;

/** The value row of one summary field that is not a before/after pair. */
function valueRow(field: string, value: unknown): ChangeRow {
  if (Array.isArray(value)) return { kind: "value", field, value: value.map((item) => (isRecord(item) || Array.isArray(item) ? JSON.stringify(item) : item)).join(", ") };
  if (isRecord(value)) return { kind: "value", field, value: JSON.stringify(value) };
  return { kind: "value", field, value };
}

export function changeRows(summary: unknown): ChangeRow[] {
  if (!isRecord(summary)) return [];
  const rows: ChangeRow[] = [];
  const paired = isRecord(summary.old) && isRecord(summary.new);
  if (paired) {
    const before = summary.old as Record<string, unknown>;
    const after = summary.new as Record<string, unknown>;
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) rows.push({ kind: "change", field: key, from: before[key], to: after[key] });
  }
  for (const [field, value] of Object.entries(summary)) {
    if (paired && (field === "old" || field === "new")) continue;
    if ((field === "added" || field === "removed") && Array.isArray(value)) {
      for (const entry of value) rows.push({ kind: field, field, value: entry });
    } else if (isFromTo(value)) {
      rows.push({ kind: "change", field, from: value.from, to: value.to });
    } else {
      rows.push(valueRow(field, value));
    }
  }
  return rows;
}
