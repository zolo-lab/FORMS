/**
 * Import the interactive (AcroForm) fields of an existing PDF as form fields + stamps,
 * so a ready-made fillable PDF becomes a form in one click. Scanned PDFs simply have none.
 */
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  type PDFWidgetAnnotation,
} from "pdf-lib";
import type { PdfStamp } from "@/lib/forms/pdf-mapping";
import type { FormDefinition, FormField } from "@/lib/forms/schema";
import { allFields } from "@/lib/forms/schema";

export interface AcroImport {
  fields: FormField[];
  stamps: PdfStamp[];
  /** True when the PDF had interactive fields (they are flattened when the PDF is stamped). */
  acroImported: boolean;
}

type Rect = { x: number; y: number; width: number; height: number };

function pageIndexOf(doc: PDFDocument, widget: PDFWidgetAnnotation): number {
  const ref = doc.context.getObjectRef(widget.dict)?.toString();
  if (!ref) return 0;
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const annots = pages[i]!.node.Annots()?.asArray() ?? [];
    if (annots.some((a) => a.toString() === ref)) return i;
  }
  return 0;
}

export async function importAcroForm(bytes: Uint8Array): Promise<AcroImport> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const fields: FormField[] = [];
  const stamps: PdfStamp[] = [];
  let n = 0;
  const nextId = () => `acro_${++n}`;

  const widgetsOf = (acro: { getWidgets(): PDFWidgetAnnotation[] }) =>
    acro.getWidgets().map((w) => {
      const r = w.getRectangle();
      const rect: Rect = { x: r.x, y: r.y, width: Math.max(1, r.width), height: Math.max(1, r.height) };
      return { widget: w, page: pageIndexOf(doc, w), rect };
    });

  for (const pdfField of doc.getForm().getFields()) {
    const label = pdfField.getName();
    const id = nextId();
    const ws = widgetsOf(pdfField.acroField);
    if (ws.length === 0) continue;
    const base = { id: `${id}_s`, fieldId: id };

    if (pdfField instanceof PDFTextField) {
      const combed = pdfField.isCombed() && (pdfField.getMaxLength() ?? 0) > 0;
      const multiline = pdfField.isMultiline();
      fields.push({ id, type: multiline ? "long_text" : "short_text", label, settings: { pdfOnly: true, acroName: label } });
      ws.forEach((w, i) =>
        stamps.push({
          ...base,
          id: `${id}_s${i}`,
          kind: combed ? "comb" : "text",
          page: w.page,
          ...w.rect,
          ...(combed ? { comb: { cells: pdfField.getMaxLength()! } } : {}),
          ...(multiline && !combed ? { multiline: true } : {}),
        }),
      );
    } else if (pdfField instanceof PDFCheckBox) {
      fields.push({ id, type: "consent", label, settings: { pdfOnly: true, acroName: label } });
      ws.forEach((w, i) => stamps.push({ ...base, id: `${id}_s${i}`, kind: "check", page: w.page, ...w.rect }));
    } else if (pdfField instanceof PDFRadioGroup) {
      const options = pdfField.getOptions().map((o) => ({ value: o, label: o }));
      fields.push({ id, type: "radio", label, options, settings: { pdfOnly: true, acroName: label } });
      ws.forEach((w, i) => {
        const on = w.widget.getOnValue()?.decodeText() ?? options[i]?.value;
        if (on) stamps.push({ ...base, id: `${id}_s${i}`, kind: "check", whenValue: on, page: w.page, ...w.rect });
      });
    } else if (pdfField instanceof PDFDropdown) {
      const options = pdfField.getOptions().map((o) => ({ value: o, label: o }));
      fields.push({ id, type: "dropdown", label, options, settings: { pdfOnly: true, acroName: label } });
      ws.forEach((w, i) => stamps.push({ ...base, id: `${id}_s${i}`, kind: "text", page: w.page, ...w.rect }));
    } else if (pdfField instanceof PDFSignature) {
      fields.push({ id, type: "signature", label, settings: { pdfOnly: true, acroName: label } });
      ws.forEach((w, i) => stamps.push({ ...base, id: `${id}_s${i}`, kind: "signature", page: w.page, ...w.rect }));
    }
  }
  // Radio groups with options but no usable stamp are dropped later by the caller if needed.
  return { fields, stamps, acroImported: fields.length > 0 };
}

/**
 * Rename imported ids so they cannot clash with the fields already in `def`,
 * and return the merged definition (fields appended to the first page).
 */
export function mergeAcroImport(def: FormDefinition, imp: AcroImport): { definition: FormDefinition; stamps: PdfStamp[] } {
  const used = new Set(allFields(def).map((f) => f.id));
  const rename = new Map<string, string>();
  let n = 0;
  for (const f of imp.fields) {
    let id = f.id;
    while (used.has(id)) id = `acro${++n}_${f.id}`;
    used.add(id);
    rename.set(f.id, id);
  }
  const fields = imp.fields.map((f) => ({ ...f, id: rename.get(f.id)! }));
  const stamps = imp.stamps.map((s) => ({ ...s, fieldId: rename.get(s.fieldId) ?? s.fieldId, id: `${rename.get(s.fieldId) ?? s.fieldId}_${s.id}` }));
  const [first, ...rest] = def.pages;
  return { definition: { ...def, pages: [{ ...first!, fields: [...first!.fields, ...fields] }, ...rest] }, stamps };
}
