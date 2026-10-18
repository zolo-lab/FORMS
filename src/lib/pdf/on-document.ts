/** Pure helpers for "fill on the document": which stamps get an input, and how input maps to answers. */
import { filterCharset } from "@/lib/forms/charset";
import { evaluateCondition, type Answers } from "@/lib/forms/conditions";
import type { PdfMapping, PdfStamp } from "@/lib/forms/pdf-mapping";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { allFields, type FormDefinition, type FormField } from "@/lib/forms/schema";

/** Any stamp-like object; only `part` / `whenValue` are read. */
type StampLike = { part?: string; whenValue?: string; [k: string]: unknown };

const NUMERIC = new Set(["number", "currency", "percent"]);

/**
 * Stamps that get an input on the page: top-level fields (no table cells) of this role's form.
 * `comb` (one box per character) and `initials` (the signer types the full name, the PDF shows initials)
 * are typed like text. date_signed / image / stamp_image have nothing to fill in.
 */
export const EDITABLE_KINDS: ReadonlySet<PdfStamp["kind"]> = new Set(["text", "comb", "initials", "check", "signature"]);

/** "children[2].name" → { table: "children", row: 2, col: "name" }; null for an ordinary field id. */
export function cellRef(fieldId: string): { table: string; row: number; col: string } | null {
  const m = /^(.+)\[(\d+)\]\.(.+)$/.exec(fieldId);
  return m ? { table: m[1]!, row: Number(m[2]), col: m[3]! } : null;
}

/** The field a stamp fills: the field itself, or the column field for a table-cell stamp. */
export function stampField(def: FormDefinition, stamp: { fieldId: string }): FormField | undefined {
  const cell = cellRef(stamp.fieldId);
  const fields = allFields(def);
  if (!cell) return fields.find((f) => f.id === stamp.fieldId);
  const table = fields.find((f) => f.id === cell.table && f.type === "repeating_table");
  if (!table) return undefined;
  const max = Number(table.settings?.maxRows ?? Infinity);
  if (cell.row >= max) return undefined;
  return table.fields?.find((c) => c.id === cell.col);
}

/** Current value behind a stamp (a table cell reads answers[table][row][col]). */
export function stampValue(answers: Answers, stamp: { fieldId: string }): unknown {
  const cell = cellRef(stamp.fieldId);
  if (!cell) return answers[stamp.fieldId];
  const rows = answers[cell.table];
  const row = Array.isArray(rows) ? (rows[cell.row] as Record<string, unknown> | undefined) : undefined;
  return row?.[cell.col];
}

/** New answers with a stamp's value set (undefined clears it; empty trailing rows are dropped). */
export function setStampValue(answers: Answers, stamp: { fieldId: string }, v: unknown): Answers {
  const cell = cellRef(stamp.fieldId);
  const next: Answers = { ...answers };
  if (!cell) {
    if (v === undefined) delete next[stamp.fieldId];
    else next[stamp.fieldId] = v;
    return next;
  }
  const rows: Record<string, unknown>[] = Array.isArray(answers[cell.table]) ? [...(answers[cell.table] as Record<string, unknown>[])] : [];
  while (rows.length <= cell.row) rows.push({});
  const row = { ...(rows[cell.row] ?? {}) };
  if (v === undefined) delete row[cell.col];
  else row[cell.col] = v;
  rows[cell.row] = row;
  while (rows.length && Object.keys(rows[rows.length - 1]!).length === 0) rows.pop();
  if (rows.length) next[cell.table] = rows;
  else delete next[cell.table];
  return next;
}

export function simpleStamps(mapping: PdfMapping, def: FormDefinition): PdfStamp[] {
  return tabOrder(mapping.stamps.filter((s) => EDITABLE_KINDS.has(s.kind) && !!stampField(def, s)));
}

/**
 * Keyboard order of the inputs on the document: page, then explicit `tabIndex` (lower first), then reading order
 * (top to bottom – PDF y grows upward – and start to end). Stable, so DOM order = Tab order.
 */
export function tabOrder<T extends { page: number; tabIndex?: number; x: number; y: number }>(stamps: T[]): T[] {
  return [...stamps].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const ta = a.tabIndex ?? Number.POSITIVE_INFINITY;
    const tb = b.tabIndex ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
    return a.x - b.x;
  });
}

/** HTML input attributes that match the field type, so phones show a number pad and dates a picker. */
export function inputAttrs(field: FormField): { type: string; inputMode?: "numeric" | "decimal" | "tel" | "email"; dir?: "ltr" } {
  switch (field.type) {
    case "date": return { type: "date", dir: "ltr" };
    case "time": return { type: "time", dir: "ltr" };
    case "id_number": return { type: "text", inputMode: "numeric", dir: "ltr" };
    case "phone": return { type: "tel", inputMode: "tel", dir: "ltr" };
    case "email": return { type: "email", inputMode: "email", dir: "ltr" };
    case "number": case "currency": case "percent": return { type: "text", inputMode: "decimal", dir: "ltr" };
    default: return field.validation?.charset === "digits" ? { type: "text", inputMode: "numeric", dir: "ltr" } : { type: "text" };
  }
}

/** Fields the signer can't type into: computed by a formula or read-only. */
export function isComputedOrLocked(field: FormField): boolean {
  return !!field.formula || !!field.readOnly;
}

/** Locked on the document: computed, read-only, or its `disabledIf` holds. A field without `disabledIf` is never locked by it. */
export function isLockedOnDocument(field: FormField, answers: Answers): boolean {
  return isComputedOrLocked(field) || (!!field.disabledIf && evaluateCondition(field.disabledIf, answers));
}

export function readText(_field: FormField, value: unknown, stamp: StampLike): string {
  const v = stamp.part && value && typeof value === "object" ? (value as Record<string, unknown>)[stamp.part] : value;
  return v === undefined || v === null ? "" : String(v);
}

export function writeText(field: FormField, current: unknown, stamp: StampLike, input: string): unknown {
  if (stamp.part) {
    const obj = { ...((current && typeof current === "object" ? current : {}) as Record<string, unknown>) };
    if (input === "") delete obj[stamp.part];
    else obj[stamp.part] = input;
    return Object.keys(obj).length ? obj : undefined;
  }
  if (field.type === "short_text" || field.type === "long_text") input = filterCharset(input, field.validation?.charset);
  if (input === "") return undefined;
  if (NUMERIC.has(field.type)) {
    const n = Number(input);
    return Number.isFinite(n) ? n : input;
  }
  return input;
}

export function readCheck(_field: FormField, value: unknown, stamp: StampLike): boolean {
  if (stamp.whenValue === undefined) return value === true || value === "yes";
  if (Array.isArray(value)) return value.includes(stamp.whenValue);
  return String(value) === stamp.whenValue;
}

export function writeCheck(field: FormField, current: unknown, stamp: StampLike, checked: boolean): unknown {
  if (stamp.whenValue === undefined) return checked ? true : undefined;
  if (field.type === "checkboxes") {
    const list = Array.isArray(current) ? (current as string[]) : [];
    const next = checked ? (list.includes(stamp.whenValue) ? list : [...list, stamp.whenValue]) : list.filter((x) => x !== stamp.whenValue);
    return next.length ? next : undefined;
  }
  return checked ? stamp.whenValue : readCheck(field, current, stamp) ? undefined : current;
}

/** On-document mode is offered only when every answerable field of the role's form is placed on the PDF. */
export function coversAll(mapping: PdfMapping, def: FormDefinition): boolean {
  const placed = new Set(simpleStamps(mapping, def).map((s) => cellRef(s.fieldId)?.table ?? s.fieldId));
  return allFields(def)
    .filter((f) => FIELD_TYPE_META[f.type].hasAnswer && f.type !== "hidden" && !isComputedOrLocked(f))
    .every((f) => placed.has(f.id));
}
