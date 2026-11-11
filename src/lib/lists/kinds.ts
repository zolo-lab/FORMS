/**
 * The fields of a list type ("ספק": name, company id, e-mail…) and the values a list (one supplier) holds in them.
 * Pure and unit tested: the store and the sheet both go through it, so a value is checked the same way everywhere.
 */
import { valueProblem } from "@/lib/fields/record";
import type { DictionaryType } from "@/lib/fields/types";

/** Single-value kinds that are plain text underneath, checked by `valueProblem`. */
export const TEXT_KINDS = ["short_text", "long_text", "number", "currency", "percent", "id_number", "phone", "email", "date"] as const;
/** Every kind a list field can have: the text kinds, yes/no, a choice from options, and "belongs to" another list. */
export const LIST_FIELD_KINDS = [...TEXT_KINDS, "yes_no", "select", "ref"] as const;
export type ListFieldKind = (typeof LIST_FIELD_KINDS)[number];

export const KIND_LABELS: Record<ListFieldKind, string> = {
  short_text: "טקסט",
  long_text: "טקסט ארוך",
  number: "מספר",
  currency: "סכום",
  percent: "אחוז",
  id_number: "תעודת זהות",
  phone: "טלפון",
  email: "מייל",
  date: "תאריך",
  yes_no: "כן / לא",
  select: "בחירה מרשימה",
  ref: "שייך ל…",
};

/** Kinds whose value reads left to right even inside a Hebrew table. */
export const LTR_KINDS = new Set<ListFieldKind>(["number", "currency", "percent", "id_number", "phone", "email", "date"]);

export const isListFieldKind = (k: unknown): k is ListFieldKind => typeof k === "string" && (LIST_FIELD_KINDS as readonly string[]).includes(k);
export const isTextKind = (k: ListFieldKind): k is (typeof TEXT_KINDS)[number] => (TEXT_KINDS as readonly string[]).includes(k);

export const MAX_OPTIONS = 200;
export const MAX_OPTION_LENGTH = 120;
export const MAX_CELL = 500;

/** The options of a choice field: trimmed, without empties or repeats, in the order given. */
/** Whether a list of options is over the cap once tidied – refused on the server rather than cut short in silence. */
export function tooManyOptions(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  const seen = new Set<string>();
  for (const o of raw) {
    if (typeof o !== "string") continue;
    const v = o.replace(/\s+/g, " ").trim().slice(0, MAX_OPTION_LENGTH);
    if (v) seen.add(v);
  }
  return seen.size > MAX_OPTIONS;
}

export function cleanOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of raw) {
    if (typeof o !== "string") continue;
    const v = o.replace(/\s+/g, " ").trim().slice(0, MAX_OPTION_LENGTH);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_OPTIONS) break;
  }
  return out;
}

export interface ListField {
  key: string;
  label: string;
  kind: ListFieldKind;
  options?: string[];
  multi?: boolean;
}

/** A cell's value: one string, or several for a multiple choice. Empty is `""` (or `[]`). */
export type CellValue = string | string[];

/**
 * Checks one cell against its field. `refIds` are the lists a "belongs to" field may point at.
 * Returns the value to store (empty means "clear it") or the reason it was refused, in Hebrew.
 */
export function cleanCell(field: ListField, raw: unknown, refIds?: ReadonlySet<string>): { ok: true; value: CellValue } | { ok: false; error: string } {
  if (field.kind === "select") {
    const options = field.options ?? [];
    if (field.multi) {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
      const picked = cleanOptions(list);
      const bad = picked.find((p) => !options.includes(p));
      return bad ? { ok: false, error: `"${bad}" אינו אחת האפשרויות` } : { ok: true, value: options.filter((o) => picked.includes(o)) };
    }
    const v = typeof raw === "string" ? raw.trim() : "";
    return !v || options.includes(v) ? { ok: true, value: v } : { ok: false, error: `"${v}" אינו אחת האפשרויות` };
  }
  const v = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_CELL) : "";
  if (!v) return { ok: true, value: "" };
  if (field.kind === "yes_no") return v === "yes" || v === "no" ? { ok: true, value: v } : { ok: false, error: "כן או לא" };
  if (field.kind === "ref") return refIds?.has(v) ? { ok: true, value: v } : { ok: false, error: "הרשימה שנבחרה לא קיימת" };
  const problem = valueProblem(field.kind as DictionaryType, v);
  return problem ? { ok: false, error: problem } : { ok: true, value: v };
}

/**
 * A record's name as a filler may see it in a form's picker: the first non-empty plain-text field among those the
 * form itself links to (`used`) – a text field the form did not ask for (notes, a diagnosis) is never sent to a
 * browser, nor is an ID number, a phone, an amount, a date or a choice. Nothing when none applies ("רשומה N").
 */
export function fillerTitle(values: Record<string, CellValue>, fields: { key: string; kind: ListFieldKind }[], used: ReadonlySet<string>): string | undefined {
  for (const f of fields) {
    if (!used.has(f.key) || (f.kind !== "short_text" && f.kind !== "long_text")) continue;
    const v = values[f.key];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

/**
 * A parent record's name, shown for a "belongs to" field the form links to (linking it is the builder's choice to
 * show the parent's name): the parent's first field, when it is a short text – the name by the lists' convention.
 * Never a long text (notes) or any other kind. Nothing otherwise ("רשומה N").
 */
export function parentTitle(values: Record<string, CellValue>, fields: { key: string; kind: ListFieldKind }[]): string | undefined {
  const first = fields[0];
  if (!first || first.kind !== "short_text") return undefined;
  const v = values[first.key];
  return typeof v === "string" && v ? v : undefined;
}

/** What a list is called in a dropdown: its first non-empty text value, else "ללא שם". */
export function listTitle(values: Record<string, CellValue>, fields: { key: string; kind: ListFieldKind }[]): string {
  for (const f of fields) {
    if (f.kind === "ref" || f.kind === "select" || f.kind === "yes_no") continue;
    const v = values[f.key];
    if (typeof v === "string" && v) return v;
  }
  // No text field filled: the first choice tells the records apart at least ("עגבניה, מלפפון").
  for (const f of fields) {
    const v = values[f.key];
    if (f.kind === "select" && Array.isArray(v) && v.length) return v.join(", ");
    if (f.kind === "select" && typeof v === "string" && v) return v;
  }
  return "ללא שם";
}

/**
 * An organization's several picks are kept as one line ("א, ב") so a form pre-filled from it reads naturally. Read
 * back against the options: pieces are joined again while they do not make an option, so an option that itself holds
 * ", " survives the round trip.
 */
export function splitPicks(line: string, options: readonly string[]): string[] {
  const text = line.trim();
  if (!text) return [];
  if (options.includes(text)) return [text];
  const out: string[] = [];
  let cur = "";
  for (const piece of text.split(", ")) {
    cur = cur ? `${cur}, ${piece}` : piece;
    if (options.includes(cur)) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) out.push(...cur.split(", "));
  return out;
}

/** Pasted text as option lines: rows and cells (tabs) both split, blanks and repeats dropped, each line tidied. */
export function splitPasted(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n|\t/)) {
    const line = raw.replace(/\s+/g, " ").trim().slice(0, 120);
    if (line && !out.includes(line)) out.push(line);
  }
  return out;
}
