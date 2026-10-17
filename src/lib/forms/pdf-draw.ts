/**
 * "Draw on the PDF": the admin picks an element from a palette and drops it on a page.
 * That creates an ordinary form field (it shows in the editor and in the responsive form like any other)
 * and the stamp that draws it on the PDF. There is no separate class of "PDF-only" fields.
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
  { id: "multi", label: "בחירה מרובה", fieldType: "checkboxes", fieldLabel: "בחירה מרובה", stamp: { kind: "check", whenValue: "o1" } },
  { id: "dropdown", label: "רשימה נפתחת", fieldType: "dropdown", fieldLabel: "רשימה", stamp: { kind: "text" } },
  { id: "stamp", label: "חותמת (תמונה)", fieldType: null, stamp: { kind: "stamp_image" }, size: { width: 90, height: 90 } },
];

/** Pages with `field` appended to the page at `pageIndex` (default: the last page). */
function pagesWithField(def: FormDefinition, field: FormField, pageIndex?: number) {
  const at = pageIndex !== undefined && pageIndex >= 0 && pageIndex < def.pages.length ? pageIndex : def.pages.length - 1;
  return def.pages.map((p, i) => (i === at ? { ...p, fields: [...p.fields, field] } : p));
}

/** Smallest `<base>N` not used by any field in the form. */
export function uniqueFieldId(def: FormDefinition, base: string): string {
  const used = new Set(allFields(def).map((f) => f.id));
  let n = 1;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export interface DrawResult {
  definition: FormDefinition;
  stamp: PdfStamp;
}

/**
 * Add the field (if the element has one) to the form and build the stamp at `box`.
 * `formPage` is the form page (not PDF page) that receives the field; default is the last one.
 */
export function addDrawnElement(
  def: FormDefinition,
  entry: PaletteEntry,
  page: number,
  box: { x: number; y: number },
  newId: () => string,
  formPage?: number,
): DrawResult {
  const size = entry.size ?? DEFAULT_SIZE[entry.stamp.kind];
  let definition = def;
  let fieldId: string;
  if (entry.fieldType) {
    fieldId = uniqueFieldId(def, `pdf_${entry.id}_`);
    const field: FormField = {
      id: fieldId,
      type: entry.fieldType,
      label: entry.fieldLabel ?? entry.label,
    };
    // Choice fields need options to be fillable; the admin renames them in the settings panel.
    if (entry.fieldType === "radio" || entry.fieldType === "dropdown" || entry.fieldType === "checkboxes") {
      field.options = [{ value: "o1", label: "אפשרות 1" }, { value: "o2", label: "אפשרות 2" }];
    }
    definition = { ...def, pages: pagesWithField(def, field, formPage) };
  } else {
    // Stamp-only elements point at a fixed id that stampPdf never resolves.
    fieldId = `_${entry.id}`;
  }
  const stamp: PdfStamp = { ...entry.stamp, id: newId(), fieldId, page, x: box.x, y: box.y, ...size };
  return { definition, stamp };
}

/**
 * Copy of a form field under a new id, right after the original (copy/paste of an element on the PDF makes a new
 * field, like iForms). Null for ids that are not top-level fields (table cells, stamp-only elements).
 */
export function cloneField(def: FormDefinition, fieldId: string): { definition: FormDefinition; fieldId: string } | null {
  const source = def.pages.flatMap((p) => p.fields).find((f) => f.id === fieldId);
  if (!source) return null;
  const base = /^(.*?)(\d+)$/.exec(source.id)?.[1] ?? `${source.id}_`;
  const id = uniqueFieldId(def, base);
  const pages = def.pages.map((p) => {
    const at = p.fields.findIndex((f) => f.id === fieldId);
    if (at < 0) return p;
    const fields = [...p.fields];
    fields.splice(at + 1, 0, { ...source, id });
    return { ...p, fields };
  });
  return { definition: { ...def, pages }, fieldId: id };
}
