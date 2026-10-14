/**
 * "Draw on the PDF": the admin picks an element from a palette and drops it on a page.
 * That creates a form field (marked `settings.pdfOnly`, living on the first form page) and the stamp that draws it.
 * Pure logic, no React.
 */
import type { PdfStamp } from "./pdf-mapping";
import { DEFAULT_SIZE } from "./pdf-items";
import type { FieldType } from "./field-types";
import { allFields, type FormDefinition, type FormField } from "./schema";

export interface PaletteEntry {
  id: string;
  label: string;
  /** Field created for this element; null = stamp only (nothing to fill in). */
  fieldType: FieldType | null;
  stamp: Pick<PdfStamp, "kind"> & Partial<PdfStamp>;
  /** Label given to the new field. */
  fieldLabel?: string;
  size?: { width: number; height: number };
}

export const PDF_PALETTE: PaletteEntry[] = [
  { id: "text", label: "טקסט", fieldType: "short_text", fieldLabel: "טקסט", stamp: { kind: "text" } },
  { id: "long", label: "טקסט רב-שורה", fieldType: "long_text", fieldLabel: "פסקה", stamp: { kind: "text", multiline: true }, size: { width: 220, height: 60 } },
  { id: "id", label: 'ת"ז בתאים', fieldType: "id_number", fieldLabel: "מספר זהות", stamp: { kind: "comb", comb: { cells: 9 } }, size: { width: 180, height: 20 } },
  { id: "phone", label: "טלפון", fieldType: "phone", fieldLabel: "טלפון", stamp: { kind: "text" } },
  { id: "email", label: "דוא\"ל", fieldType: "email", fieldLabel: "דוא\"ל", stamp: { kind: "text", align: "left" }, size: { width: 160, height: 16 } },
  { id: "number", label: "מספר", fieldType: "number", fieldLabel: "מספר", stamp: { kind: "text", align: "center" }, size: { width: 40, height: 16 } },
  { id: "date", label: "תאריך", fieldType: "date", fieldLabel: "תאריך", stamp: { kind: "text", align: "center" }, size: { width: 80, height: 16 } },
  { id: "check", label: "תיבת סימון", fieldType: "consent", fieldLabel: "אישור", stamp: { kind: "check" } },
  { id: "signature", label: "חתימה", fieldType: "signature", fieldLabel: "חתימה", stamp: { kind: "signature" } },
  { id: "initials", label: "ראשי תיבות", fieldType: "short_text", fieldLabel: "ראשי תיבות", stamp: { kind: "initials" } },
  { id: "date_signed", label: "תאריך חתימה", fieldType: null, stamp: { kind: "date_signed", align: "center" } },
  { id: "radio", label: "בחירה (רדיו)", fieldType: "radio", fieldLabel: "בחירה", stamp: { kind: "check", whenValue: "o1" } },
  { id: "dropdown", label: "רשימה נפתחת", fieldType: "dropdown", fieldLabel: "רשימה", stamp: { kind: "text" } },
  { id: "stamp", label: "חותמת (תמונה)", fieldType: null, stamp: { kind: "stamp_image" }, size: { width: 90, height: 90 } },
];

/** Fields drawn on the PDF live on their own page so they are not mixed with the regular questions. */
export const PDF_FIELDS_PAGE_ID = "pdf_fields";
export const PDF_FIELDS_PAGE_TITLE = "שדות במסמך";

/**
 * Pages with `field` appended to the PDF-fields page. A form whose only page is still empty (a fresh "טופס מ-PDF")
 * uses that page instead of adding a second one, so the form never has an empty page that blocks publishing.
 */
function pagesWithPdfField(def: FormDefinition, field: FormField) {
  if (def.pages.some((p) => p.id === PDF_FIELDS_PAGE_ID)) {
    return def.pages.map((p) => (p.id === PDF_FIELDS_PAGE_ID ? { ...p, fields: [...p.fields, field] } : p));
  }
  if (def.pages.length === 1 && def.pages[0]!.fields.length === 0) {
    return [{ ...def.pages[0]!, id: PDF_FIELDS_PAGE_ID, title: PDF_FIELDS_PAGE_TITLE, fields: [field] }];
  }
  return [...def.pages, { id: PDF_FIELDS_PAGE_ID, title: PDF_FIELDS_PAGE_TITLE, fields: [field] }];
}

/** Smallest `<base>N` not used by any field in the form. */
export function uniqueFieldId(def: FormDefinition, base: string): string {
  const used = new Set(allFields(def).map((f) => f.id));
  let n = 1;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export interface PdfOnlyResult {
  definition: FormDefinition;
  stamp: PdfStamp;
}

/** Add the field (if any) to the dedicated PDF-fields page and build the stamp at `box`. */
export function addPdfOnlyElement(
  def: FormDefinition,
  entry: PaletteEntry,
  page: number,
  box: { x: number; y: number },
  newId: () => string,
): PdfOnlyResult {
  const size = entry.size ?? DEFAULT_SIZE[entry.stamp.kind];
  let definition = def;
  let fieldId: string;
  if (entry.fieldType) {
    fieldId = uniqueFieldId(def, `pdf_${entry.id}_`);
    const field: FormField = {
      id: fieldId,
      type: entry.fieldType,
      label: entry.fieldLabel ?? entry.label,
      settings: { pdfOnly: true },
    };
    // Choice fields need options to be fillable; the admin renames them in the settings panel.
    if (entry.fieldType === "radio" || entry.fieldType === "dropdown") {
      field.options = [{ value: "o1", label: "אפשרות 1" }, { value: "o2", label: "אפשרות 2" }];
    }
    definition = { ...def, pages: pagesWithPdfField(def, field) };
  } else {
    // Stamp-only elements point at a fixed id that stampPdf never resolves.
    fieldId = `_${entry.id}`;
  }
  const stamp: PdfStamp = { ...entry.stamp, id: newId(), fieldId, page, x: box.x, y: box.y, ...size };
  return { definition, stamp };
}

/** Remove a pdf-only field when its stamp is deleted. */
export function dropPdfOnlyField(def: FormDefinition, fieldId: string): FormDefinition {
  const target = allFields(def).find((f) => f.id === fieldId);
  if (!target?.settings?.pdfOnly) return def;
  const pages = def.pages.map((p) => ({ ...p, fields: p.fields.filter((f) => f.id !== fieldId) }));
  // The dedicated page goes away with its last field (unless it is the only page).
  const kept = pages.filter((p) => !(p.id === PDF_FIELDS_PAGE_ID && p.fields.length === 0));
  return { ...def, pages: kept.length ? kept : pages };
}

/** Put a previously dropped pdf-only field back (undo of a stamp deletion). No-op when the id already exists. */
export function restorePdfOnlyField(def: FormDefinition, field: FormField): FormDefinition {
  if (allFields(def).some((f) => f.id === field.id)) return def;
  return { ...def, pages: pagesWithPdfField(def, field) };
}

/**
 * Copy of a pdf-only field under a new id (copy/paste of a drawn element makes a new field, like iForms).
 * Returns null for regular form fields: pasting their stamp just draws the same answer twice.
 */
export function clonePdfOnlyField(def: FormDefinition, fieldId: string): { definition: FormDefinition; fieldId: string } | null {
  const source = pdfOnlyFieldOf(def, fieldId);
  if (!source) return null;
  const base = /^(.*?)(\d+)$/.exec(source.id)?.[1] ?? `${source.id}_`;
  const id = uniqueFieldId(def, base);
  return { definition: { ...def, pages: pagesWithPdfField(def, { ...source, id }) }, fieldId: id };
}

/** The pdf-only field a stamp refers to, if any (so it can be remembered before it is dropped). */
export function pdfOnlyFieldOf(def: FormDefinition, fieldId: string): FormField | undefined {
  const f = allFields(def).find((x) => x.id === fieldId);
  return f?.settings?.pdfOnly ? f : undefined;
}
