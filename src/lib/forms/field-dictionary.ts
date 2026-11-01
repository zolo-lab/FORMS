/**
 * The list of a form's fields as a spreadsheet (id, export key, label, type, step, who fills it, options, PDF page),
 * and readable ids for fields that still carry a generated one ("pdf_short_text_3", "date_2"). Pure.
 */
import { FIELD_TYPES, FIELD_TYPE_META } from "./field-types";
import { fieldKey } from "./field-keys";
import type { PdfStamp } from "./pdf-mapping";
import type { FormDefinition, FormField } from "./schema";

const FILLER_LABELS: Record<string, string> = { requester: "המנהל המבקש", employee: "העובד", approver: "מאשר", payroll: "חשבות שכר", hr: "משאבי אנוש", approver2: "מאשר 2", approver3: "מאשר 3", approver4: "מאשר 4", approver5: "מאשר 5", approver6: "מאשר 6", unassigned: "לא משויך לשלב" };

export const DICTIONARY_HEADER = ["מזהה", "מפתח ייצוא", "שם השדה", "סוג", "עמוד", "שלב", "חובה", "אפשרויות", "עמוד ב-PDF"];

/** One row per answer field (and per column of a repeating table: "children[].name"), in form order. */
export function fieldDictionary(def: FormDefinition, stamps: PdfStamp[] = []): string[][] {
  const pageOf = new Map<string, number>();
  for (const s of stamps) {
    const base = s.fieldId.replace(/\[\d+\]\..*$/, "");
    const cur = pageOf.get(base);
    if (cur === undefined || s.page < cur) pageOf.set(base, s.page);
  }
  const rows: string[][] = [DICTIONARY_HEADER];
  def.pages.forEach((page, pi) => {
    const step = page.title?.trim() || `עמוד ${pi + 1}`;
    for (const f of page.fields) {
      if (!FIELD_TYPE_META[f.type]?.hasAnswer) continue;
      const pdfPage = pageOf.has(f.id) ? String(pageOf.get(f.id)! + 1) : "";
      rows.push(row(f.id, f, step, pdfPage));
      if (f.type === "repeating_table") for (const c of f.fields ?? []) rows.push(row(`${f.id}[].${c.id}`, c, step, pdfPage, f));
    }
  });
  return rows;
}

function row(id: string, f: FormField, step: string, pdfPage: string, parent?: FormField): string[] {
  const filler = parent?.filledBy ?? f.filledBy ?? "employee";
  return [
    id,
    f.exportKey?.trim() || "",
    parent ? `${parent.label} – ${f.label}` : f.label,
    FIELD_TYPE_META[f.type]?.label ?? f.type,
    step,
    FILLER_LABELS[filler] ?? filler,
    f.required ? "כן" : "",
    (f.options ?? []).map((o) => o.label).join(" | "),
    pdfPage,
  ];
}

/** An id the system made up rather than a person: "pdf_short_text_3", "short_text", "date_2", "field_4". */
export function isGeneratedId(id: string): boolean {
  if (/^pdf_[a-z_]+_\d+$/.test(id) || /^field(_\d+)?$/.test(id)) return true;
  return (FIELD_TYPES as readonly string[]).some((t) => id === t || new RegExp(`^${t}_\\d+$`).test(id));
}

/**
 * Readable ids for the answer fields that still have a generated one: [from, to] pairs, unique across the form.
 * The step title stands in for the section ("פרטי בן/בת הזוג" → "spouse_…").
 */
export function suggestFieldIds(def: FormDefinition): [string, string][] {
  const taken = new Set(def.pages.flatMap((p) => p.fields.map((f) => f.id)));
  const out: [string, string][] = [];
  for (const page of def.pages) {
    for (const f of page.fields) {
      if (!FIELD_TYPE_META[f.type]?.hasAnswer || !isGeneratedId(f.id)) continue;
      const base = fieldKey(f.label, page.title, "");
      if (!base) continue;
      taken.delete(f.id);
      let to = base;
      for (let n = 2; taken.has(to); n++) to = `${base}_${n}`;
      taken.add(to);
      if (to !== f.id) out.push([f.id, to]);
    }
  }
  return out;
}

/** Stamps follow a renamed field, table cells included ("old[2].name" → "new[2].name"). */
export function renameStamps(stamps: PdfStamp[], from: string, to: string): PdfStamp[] {
  return stamps.map((s) => {
    if (s.fieldId === from) return { ...s, fieldId: to };
    if (s.fieldId.startsWith(`${from}[`)) return { ...s, fieldId: to + s.fieldId.slice(from.length) };
    return s;
  });
}
