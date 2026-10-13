/**
 * Package = several forms filled in one go. Fields with the same `id` across the
 * documents are asked once; the answer is later spread to each document (splitAnswers).
 */
import type { Answers } from "./conditions";
import { allFields, type FillerRole, type FormDefinition, type FormPage } from "./schema";

export interface PackageDoc {
  title: string;
  definition: FormDefinition;
}

/** One form to fill the whole package at a signing step. Fields of other roles are read-only. */
export function mergedDefinitionForStep(docs: PackageDoc[], role: FillerRole): FormDefinition {
  const seen = new Set<string>();
  const pages: FormPage[] = [];
  docs.forEach((d, di) => {
    for (const page of d.definition.pages) {
      const fields = page.fields.filter((f) => {
        if (seen.has(f.id)) return false;
        seen.add(f.id);
        return true;
      });
      if (fields.length === 0) continue;
      pages.push({
        ...page,
        id: docs.length > 1 ? `d${di}_${page.id}` : page.id,
        title: docs.length > 1 ? `${d.title} – ${page.title}` : page.title,
        fields: fields.map((f) => ((f.filledBy ?? "employee") !== role ? { ...f, readOnly: true } : f)),
      });
    }
  });
  return {
    schemaVersion: 1,
    title: docs.length === 1 ? docs[0]!.definition.title : docs.map((d) => d.title).join(" + "),
    pages,
    settings: { layout: "wizard" },
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
