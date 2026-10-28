/**
 * "Draw on the PDF": the admin picks an element from a palette and drops it on a page.
 * That creates an ordinary form field (it shows in the editor and in the responsive form like any other)
 * and the stamp that draws it on the PDF. There is no separate class of "PDF-only" fields.
 * Pure logic, no React.
 */
import type { PdfStamp } from "./pdf-mapping";
import { DEFAULT_SIZE } from "./pdf-items";
import { FIELD_TYPE_META, formFieldTypesByCategory, type FieldType } from "./field-types";
import { allFields, type FormDefinition, type FormField } from "./schema";
import { uniqueId } from "./builder";
import type { DetectedField } from "@/lib/pdf/detect";
import { normalizeText } from "@/lib/pdf/match";

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

/** How each field type is drawn when it is added on the document (types not listed get a text box). */
const STAMP_FOR: Partial<Record<FieldType, Pick<PaletteEntry, "stamp" | "size">>> = {
  yes_no: { stamp: { kind: "check", whenValue: "yes" } },
  stamp: { stamp: { kind: "signature" }, size: { width: 90, height: 90 } },
  date_signed: { stamp: { kind: "date_signed", align: "center" } },
  file_upload: { stamp: { kind: "check" }, size: { width: 16, height: 16 } },
  time: { stamp: { kind: "text", align: "center" }, size: { width: 50, height: 16 } },
  currency: { stamp: { kind: "text", align: "center" }, size: { width: 70, height: 16 } },
  percent: { stamp: { kind: "text", align: "center" }, size: { width: 40, height: 16 } },
  repeating_table: { stamp: { kind: "text" } },
};

/** The element for one field type: the stamp the PDF palette always used for it, or the one above, or a text box. */
function entryForType(type: FieldType): PaletteEntry {
  const known = PDF_PALETTE.find((e) => e.fieldType === type && e.id !== "initials");
  const own = STAMP_FOR[type];
  const stamp: PaletteEntry["stamp"] = known?.stamp ?? own?.stamp ?? { kind: "text" };
  const size = known?.size ?? own?.size;
  return { id: known?.id ?? type, label: FIELD_TYPE_META[type].label, fieldType: type, fieldLabel: known?.fieldLabel ?? FIELD_TYPE_META[type].label, stamp, ...(size ? { size } : {}) };
}

export interface PaletteGroup { label: string; entries: PaletteEntry[] }

/**
 * The PDF tab's palette: exactly the field types of the responsive editor (`FORM_FIELD_TYPES`), same names,
 * categories and order. A field added here is an ordinary form field, so it shows in the responsive editor too.
 */
export function pdfPaletteGroups(): PaletteGroup[] {
  return formFieldTypesByCategory().map((g) => ({ label: g.label, entries: g.types.map(entryForType) }));
}

/** Every element of the PDF palette, by id (drag and drop carries the id). */
export function pdfPaletteEntry(id: string): PaletteEntry | undefined {
  return pdfPaletteGroups().flatMap((g) => g.entries).find((e) => e.id === id);
}

type Box = { page: number; x: number; y: number; width: number; height: number };

/**
 * Reading order of two boxes on the document: page, then top to bottom (PDF y grows upward, so the top edge is
 * y + height; boxes whose tops are within 6pt share a row), then right to left (the form is Hebrew).
 * Negative when `a` comes first.
 */
export function readingOrder(a: Box, b: Box): number {
  if (a.page !== b.page) return a.page - b.page;
  const ta = a.y + a.height;
  const tb = b.y + b.height;
  if (Math.abs(ta - tb) > 6) return tb - ta;
  return b.x + b.width - (a.x + a.width);
}

/**
 * Insert `field` where its stamp sits among the fields that already have stamps: right after the last field whose
 * first stamp comes before it, or (when it comes first) right before the earliest one. Without any placed field it
 * goes to the end of the last page. Only top-level fields count; a field never moves between pages by accident
 * (it lands on the page of its neighbour).
 */
export function insertFieldByPosition(def: FormDefinition, field: FormField, stamp: Box, stamps: (Box & { fieldId: string })[]): FormDefinition {
  const first = new Map<string, Box>();
  for (const s of stamps) {
    const cur = first.get(s.fieldId);
    if (!cur || readingOrder(s, cur) < 0) first.set(s.fieldId, s);
  }
  let before: { pi: number; fi: number; box: Box } | undefined;
  let after: { pi: number; fi: number; box: Box } | undefined;
  for (let pi = 0; pi < def.pages.length; pi++) {
    const fields = def.pages[pi]!.fields;
    for (let fi = 0; fi < fields.length; fi++) {
      const box = first.get(fields[fi]!.id);
      if (!box) continue;
      if (readingOrder(box, stamp) <= 0) {
        if (!before || readingOrder(box, before.box) >= 0) before = { pi, fi, box };
      } else if (!after || readingOrder(box, after.box) < 0) {
        after = { pi, fi, box };
      }
    }
  }
  const target: { pi: number; fi: number } | undefined = before ? { pi: before.pi, fi: before.fi + 1 } : after ? { pi: after.pi, fi: after.fi } : undefined;
  const pi = target ? target.pi : def.pages.length - 1;
  return {
    ...def,
    pages: def.pages.map((p, i) => {
      if (i !== pi) return p;
      const fields = [...p.fields];
      fields.splice(target ? target.fi : fields.length, 0, field);
      return { ...p, fields };
    }),
  };
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
 * `existing` are the stamps already on the document: the new field is inserted in the form where its position
 * suggests (see `insertFieldByPosition`); with none, it goes to the end of the last page.
 */
export function addDrawnElement(
  def: FormDefinition,
  entry: PaletteEntry,
  page: number,
  box: { x: number; y: number },
  newId: () => string,
  existing: PdfStamp[] = [],
): DrawResult {
  const size = entry.size ?? DEFAULT_SIZE[entry.stamp.kind];
  let definition = def;
  let fieldId: string;
  const at = { page, x: box.x, y: box.y, ...size };
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
    if (FIELD_TYPE_META[entry.fieldType].defaultSettings) field.settings = { ...FIELD_TYPE_META[entry.fieldType].defaultSettings };
    // A table starts with one column; the box is its first row (more rows: "שורות" in the PDF tab).
    if (entry.fieldType === "repeating_table") field.fields = [{ id: "c1", type: "short_text", label: "עמודה 1" }];
    definition = insertFieldByPosition(def, field, at, existing);
  } else {
    // Stamp-only elements point at a fixed id that stampPdf never resolves.
    fieldId = `_${entry.id}`;
  }
  const stampField = entry.fieldType === "repeating_table" ? `${fieldId}[0].c1` : fieldId;
  const stamp: PdfStamp = { ...entry.stamp, id: newId(), fieldId: stampField, page, x: box.x, y: box.y, ...size };
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

export interface AddDetectedOptions {
  /** One form step per PDF page (only when the form has no fields yet). */
  stepPerPage?: boolean;
}

const YES_NO_VALUE: Record<string, string> = { [normalizeText("כן")]: "yes", [normalizeText("לא")]: "no" };

/**
 * Turn detected fields (see `pdf/detect.ts`, after the admin's edits) into ordinary form fields plus the stamps that
 * place them on the document, marked `guessed`. Each field lands in the form where its place on the page suggests
 * (`insertFieldByPosition`), so a form with nothing in it comes out in the PDF's reading order. With `stepPerPage`
 * and an empty form, the fields are split into one step per PDF page.
 */
export function addDetectedFields(
  def: FormDefinition,
  detected: DetectedField[],
  existing: PdfStamp[],
  newId: () => string,
  opts: AddDetectedOptions = {},
): { definition: FormDefinition; stamps: PdfStamp[] } {
  const wasEmpty = allFields(def).length === 0;
  let definition = def;
  const all = [...existing];
  const added: PdfStamp[] = [];
  const pageOf = new Map<string, number>();
  const ordered = [...detected].sort((a, b) => readingOrder({ page: a.page, ...a.box }, { page: b.page, ...b.box }));
  for (const d of ordered) {
    const fieldId = d.key && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(d.key) ? uniqueId(d.key, new Set(allFields(definition).map((f) => f.id))) : uniqueFieldId(definition, `pdf_${d.type}_`);
    const field: FormField = { id: fieldId, type: d.type, label: d.label };
    const base = PDF_PALETTE.find((e) => e.fieldType === d.type)?.stamp;
    const stamps: PdfStamp[] = [];
    const put = (partial: Partial<PdfStamp> & { kind: PdfStamp["kind"] }, box: { x: number; y: number; width: number; height: number }) =>
      stamps.push({ id: newId(), fieldId, page: d.page, ...box, ...partial, guessed: true } as PdfStamp);
    if (d.type === "repeating_table" && d.columns && d.rows) {
      const ids = new Set<string>();
      const cols = d.columns.map((c) => {
        const id = uniqueId(/^[a-zA-Z]/.test(c.key) ? c.key : "col", ids);
        ids.add(id);
        return { ...c, id };
      });
      field.fields = cols.map((c) => ({ id: c.id, type: c.type, label: c.label }));
      field.settings = { ...(FIELD_TYPE_META.repeating_table.defaultSettings ?? {}), maxRows: d.rows.length };
      d.rows.forEach((r, k) => {
        for (const c of cols) {
          const t = PDF_PALETTE.find((e) => e.fieldType === c.type)?.stamp;
          stamps.push({ id: newId(), fieldId: `${fieldId}[${k}].${c.id}`, page: d.page, x: c.x, y: r.y, width: c.width, height: r.height, ...(t && t.kind === "text" ? t : {}), kind: "text", guessed: true } as PdfStamp);
        }
      });
    } else if (d.options && (d.type === "radio" || d.type === "checkboxes")) {
      field.options = d.options.map((o, i) => ({ value: `o${i + 1}`, label: o.label }));
      d.options.forEach((o, i) => put({ kind: "check", whenValue: `o${i + 1}` }, o.box));
    } else if (d.options && d.type === "yes_no") {
      for (const o of d.options) put({ kind: "check", whenValue: YES_NO_VALUE[normalizeText(o.label)] ?? "yes" }, o.box);
    } else if (d.type === "consent") {
      put({ kind: "check" }, d.box);
    } else if (d.type === "signature") {
      put({ kind: "signature" }, d.box);
    } else if (d.comb) {
      put({ kind: "comb", comb: { cells: d.comb } }, d.box);
    } else {
      const text = base && base.kind === "text" ? base : { kind: "text" as const };
      put({ ...text, kind: "text" }, d.box);
    }
    definition = insertFieldByPosition(definition, field, { page: d.page, ...d.box }, all);
    all.push(...stamps);
    added.push(...stamps);
    pageOf.set(fieldId, d.page);
  }
  if (wasEmpty && opts.stepPerPage && pageOf.size > 0) {
    const fields = definition.pages.flatMap((p) => p.fields);
    const first = definition.pages[0]!;
    const pdfPages = [...new Set(pageOf.values())].sort((a, b) => a - b);
    definition = {
      ...definition,
      pages: pdfPages.map((pg, i) => ({
        ...(i === 0 ? first : { id: `step_${i + 1}` }),
        title: `שלב ${i + 1}`,
        fields: fields.filter((f) => pageOf.get(f.id) === pg),
      })),
    };
  }
  return { definition, stamps: added };
}

/**
 * Put the fields of every step in the order of the document: page, top to bottom, right to left, by where each
 * field's first stamp sits. A field with no stamp (or a layout block) stays right after the field it followed.
 * Nothing moves between steps and no id changes.
 */
export function orderByPdf(def: FormDefinition, stamps: PdfStamp[]): FormDefinition {
  const first = new Map<string, PdfStamp>();
  for (const s of stamps) {
    const base = s.fieldId.replace(/\[\d+\]\..*$/, "");
    const cur = first.get(base);
    if (!cur || readingOrder(s, cur) < 0) first.set(base, s);
  }
  return {
    ...def,
    pages: def.pages.map((p) => {
      const groups: { lead: FormField; stamp?: PdfStamp; rest: FormField[] }[] = [];
      for (const f of p.fields) {
        const stamp = first.get(f.id);
        const last = groups[groups.length - 1];
        if (stamp || !last) groups.push({ lead: f, stamp, rest: [] });
        else last.rest.push(f);
      }
      // Groups without a stamp at the very start stay put; the others are sorted among themselves.
      const head = groups.length > 0 && !groups[0]!.stamp ? [groups.shift()!] : [];
      groups.sort((a, b) => readingOrder(a.stamp!, b.stamp!));
      return { ...p, fields: [...head, ...groups].flatMap((g) => [g.lead, ...g.rest]) };
    }),
  };
}

/**
 * Cut a step in two: `fieldId` and everything after it on that step move to a new step right after it. Cutting at
 * the first field of a step does nothing (no empty steps). The skip rules of the original step move to the new
 * last half, where the step now ends; the visibility condition is kept on both.
 */
export function splitStepAt(def: FormDefinition, fieldId: string): { definition: FormDefinition; step: number } | null {
  const pi = def.pages.findIndex((p) => p.fields.some((f) => f.id === fieldId));
  if (pi < 0) return null;
  const page = def.pages[pi]!;
  const at = page.fields.findIndex((f) => f.id === fieldId);
  if (at <= 0) return null;
  const taken = new Set(def.pages.map((p) => p.id));
  const { nextPage, ...bare } = page;
  const head = { ...bare, fields: page.fields.slice(0, at) };
  const tail = { ...bare, ...(nextPage ? { nextPage } : {}), id: uniqueId("step", taken), title: `שלב ${def.pages.length + 1}`, fields: page.fields.slice(at) };
  const pages = [...def.pages.slice(0, pi), head, tail, ...def.pages.slice(pi + 1)];
  return { definition: { ...def, pages }, step: pi + 1 };
}
