/**
 * Package = several forms filled in one go. Fields with the same `id` across the
 * documents are asked once; the answer is later spread to each document (splitAnswers).
 */
import type { Answers } from "./conditions";
import { allFields, type FillerRole, type FormDefinition, type FormPage } from "./schema";
import { stripInternalFields } from "./internal";

export interface PackageDoc {
  title: string;
  definition: FormDefinition;
}

/** One form to fill the whole package at a signing step. Fields of other roles are read-only. */
export function mergedDefinitionForStep(docsIn: PackageDoc[], role: FillerRole): FormDefinition {
  // Internal (staff-only) fields exist only for the requester.
  const docs = role === "requester" ? docsIn : docsIn.map((d) => ({ ...d, definition: stripInternalFields(d.definition) }));
  const seen = new Set<string>();
  const pages: FormPage[] = [];
  const docOfPage: number[] = [];
  docs.forEach((d, di) => {
    for (const page of d.definition.pages) {
      const fields = page.fields.filter((f) => {
        if (seen.has(f.id)) return false;
        seen.add(f.id);
        return true;
      });
      if (fields.length === 0) continue;
      docOfPage.push(di);
      pages.push({
        ...page,
        id: docs.length > 1 ? `d${di}_${page.id}` : page.id,
        title: docs.length > 1 ? `${d.title} – ${page.title}` : page.title,
        // Page ids are prefixed when several documents are merged, so jump targets must be too.
        ...(docs.length > 1 && page.nextPage ? { nextPage: page.nextPage.map((r) => ({ ...r, goTo: r.goTo === "end" ? "end" : `d${di}_${r.goTo}` })) } : {}),
        fields: fields.map((f) => ((f.filledBy ?? "employee") !== role ? { ...f, readOnly: true } : f)),
      });
    }
  });
  // "end" inside document N finishes that document only: continue with the first page of the next document.
  if (docs.length > 1) {
    pages.forEach((page, i) => {
      if (!page.nextPage?.some((r) => r.goTo === "end")) return;
      const nextDoc = docOfPage.findIndex((d) => d > docOfPage[i]!);
      const target = nextDoc === -1 ? "end" : pages[nextDoc]!.id;
      pages[i] = { ...page, nextPage: page.nextPage.map((r) => (r.goTo === "end" ? { ...r, goTo: target } : r)) };
    });
  }
  return {
    schemaVersion: 1,
    title: docs.length === 1 ? docs[0]!.definition.title : docs.map((d) => d.title).join(" + "),
    pages,
    // The first document decides how the merged form is presented.
    settings: { layout: docs[0]?.definition.settings?.layout ?? "wizard" },
  };
}

/** Answers of the merged form → one answers object per document (only that document's fields). */
export function splitAnswers(docs: PackageDoc[], answers: Answers): Answers[] {
  return docs.map((d) => {
    const out: Answers = {};
    for (const f of allFields(d.definition)) if (f.id in answers) out[f.id] = answers[f.id];
    return out;
  });
}
