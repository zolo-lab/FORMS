import type { Answers } from "./conditions";
import type { FormField } from "./schema";

/**
 * Repeating tables that grow as you fill them ("auto rows", on unless `settings.autoRows === false`):
 * the filler sees the rows already filled plus one empty row; typing in the empty row makes it real and the next
 * empty row appears. Empty rows are never stored, so an empty last row is not an error and not on the PDF.
 */

export function isBlankValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "boolean") return v === false;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as object).every(isBlankValue);
  return false;
}

export function isBlankRow(row: unknown): boolean {
  return row === undefined || row === null || isBlankValue(row);
}

export function autoRowsOn(field: Pick<FormField, "settings">): boolean {
  return field.settings?.autoRows !== false;
}

function limits(field: Pick<FormField, "settings">) {
  const s = field.settings ?? {};
  const minRows = Math.max(0, Number(s.minRows ?? 0) || 0);
  const maxRows = s.maxRows !== undefined && s.maxRows !== null && s.maxRows !== "" ? Number(s.maxRows) : Infinity;
  return { minRows, maxRows };
}

function filledCount(rows: readonly unknown[]): number {
  let n = rows.length;
  while (n > 0 && isBlankRow(rows[n - 1])) n--;
  return n;
}

/**
 * How many rows to draw. Auto rows: every row up to the last started one, then one empty row (so a table starts
 * with a single row and the next one appears as soon as something is typed), and never fewer than `minRows`.
 */
export function visibleRowCount(field: Pick<FormField, "settings">, rows: readonly unknown[]): number {
  const { minRows, maxRows } = limits(field);
  if (!autoRowsOn(field)) return Math.min(Math.max(rows.length, minRows), maxRows);
  return Math.min(Math.max(filledCount(rows) + 1, minRows, 1), maxRows);
}

/** Row `i` is the optional empty row at the end (shown so the next row can be typed). */
export function isSpareRow(field: Pick<FormField, "settings">, rows: readonly unknown[], i: number): boolean {
  return autoRowsOn(field) && i >= Math.max(filledCount(rows), limits(field).minRows);
}

/**
 * Set one cell. Row `i` may be the empty row past the end (it becomes real). Afterwards empty rows at the end
 * beyond `minRows` are dropped, so clearing the last row turns it back into the empty row instead of leaving two.
 */
export function setRowCell(field: Pick<FormField, "settings">, rows: readonly Answers[], i: number, id: string, v: unknown): Answers[] {
  const next = rows.slice();
  while (next.length <= i) next.push({});
  next[i] = { ...next[i], [id]: v };
  return autoRowsOn(field) ? trimTrailingBlankRows(next, limits(field).minRows) : next;
}

export function trimTrailingBlankRows(rows: Answers[], keep = 0): Answers[] {
  let end = rows.length;
  while (end > keep && isBlankRow(rows[end - 1])) end--;
  return end === rows.length ? rows : rows.slice(0, end);
}

/** Before validating/storing an auto-rows table: drop every empty row (also one emptied in the middle). */
export function dropBlankRows(field: Pick<FormField, "settings">, rows: unknown): unknown {
  if (!Array.isArray(rows) || !autoRowsOn(field)) return rows;
  return rows.filter((r) => !isBlankRow(r));
}
