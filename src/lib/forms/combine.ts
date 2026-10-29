/**
 * "חיבור טפסים" (iForms: kit = several templates joined into one): one new form whose document is the documents
 * one after the other and whose fields are all of theirs, so it gets one signing route. Pure, no I/O.
 */
import { renameFieldId, uniqueId } from "./builder";
import { renameStamps } from "./field-dictionary";
import type { PdfStamp } from "./pdf-mapping";
import type { FormDefinition } from "./schema";

export interface FormPart {
  definition: FormDefinition;
  stamps: PdfStamp[];
  /** Pages of this part's document (their count shifts the next part's boxes). */
  pages: { width: number; height: number }[];
}

export interface CombinedForm {
  definition: FormDefinition;
  stamps: PdfStamp[];
  pages: { width: number; height: number }[];
}

export function combineForms(title: string, parts: FormPart[]): CombinedForm {
  const fieldIds = new Set<string>();
  const pageIds = new Set<string>();
  const pages: FormDefinition["pages"] = [];
  const stamps: PdfStamp[] = [];
  const docPages: CombinedForm["pages"] = [];
  parts.forEach((part, k) => {
    let def = part.definition;
    let own = part.stamps;
    // A field id already used by an earlier form gets a new one; conditions and boxes follow it.
    for (const id of def.pages.flatMap((p) => p.fields.map((f) => f.id))) {
      if (!fieldIds.has(id)) continue;
      const to = uniqueId(id, new Set([...fieldIds, ...def.pages.flatMap((p) => p.fields.map((f) => f.id))]));
      const r = renameFieldId(def, id, to);
      if (r.error) continue;
      def = r.def;
      own = renameStamps(own, id, to);
    }
    for (const p of def.pages) {
      const id = pageIds.has(p.id) ? uniqueId(p.id, pageIds) : p.id;
      pageIds.add(id);
      pages.push({ ...p, id });
      for (const f of p.fields) fieldIds.add(f.id);
    }
    const offset = docPages.length;
    for (const s of own) stamps.push({ ...s, id: `f${k + 1}_${s.id}`, page: s.page + offset, ...(s.repeatOnPages ? { repeatOnPages: s.repeatOnPages.map((n) => n + offset) } : {}) });
    docPages.push(...part.pages);
  });
  const first = parts[0]?.definition;
  return {
    definition: { ...(first ?? { schemaVersion: 1 as const, settings: {} }), schemaVersion: 1, title, pages } as FormDefinition,
    stamps,
    pages: docPages,
  };
}
