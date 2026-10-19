/**
 * Internal (staff-only) fields, e.g. a cost centre the manager picks when opening a request.
 * They are filled by the requester (or the API) and never reach another signer: not on the signing page,
 * not in the answers sent to the browser, not drawn on the PDF, not in e-mails. Staff views and exports keep them.
 * Pure, unit tested.
 */
import type { Answers } from "./conditions";
import type { PdfMapping } from "./pdf-mapping";
import { allFields, type FormDefinition } from "./schema";

/** Ids of the internal fields of one or more definitions. */
export function internalFieldIds(defs: FormDefinition | FormDefinition[]): Set<string> {
  const ids = new Set<string>();
  for (const d of Array.isArray(defs) ? defs : [defs]) for (const f of allFields(d)) if (f.internal) ids.add(f.id);
  return ids;
}

/** The definition without its internal fields (pages left empty are dropped, but at least one page is kept). */
export function stripInternalFields(def: FormDefinition): FormDefinition {
  if (!allFields(def).some((f) => f.internal)) return def;
  const pages = def.pages.map((p) => ({ ...p, fields: p.fields.filter((f) => !f.internal) }));
  const kept = pages.filter((p) => p.fields.length > 0);
  return { ...def, pages: kept.length ? kept : [{ ...pages[0]!, fields: [] }] };
}

/** Answers without the internal fields. */
export function omitInternalAnswers(answers: Answers, ids: Set<string>): Answers {
  if (ids.size === 0) return answers;
  return Object.fromEntries(Object.entries(answers).filter(([k]) => !ids.has(k)));
}

/** Stamps of internal fields (and table cells of internal tables) are not drawn. */
export function stripInternalStamps(mapping: PdfMapping, ids: Set<string>): PdfMapping {
  if (ids.size === 0) return mapping;
  const base = (fieldId: string) => fieldId.replace(/\[\d+\]\..*$/, "");
  return { ...mapping, stamps: mapping.stamps.filter((s) => !ids.has(base(s.fieldId))) };
}
