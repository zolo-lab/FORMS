/** Which stored answers may be sent to a signer's browser: fields of their own view plus anything their conditions/formulas read. */
import { conditionFieldRefs, type Answers } from "./conditions";
import { formulaRefs, parseFormula } from "./formula";
import { allFields, type FormDefinition } from "./schema";

const PIPE = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/** Field ids used by `{{piping}}` anywhere in the definition's texts. */
export function pipedIds(def: FormDefinition): Set<string> {
  return new Set([...JSON.stringify(def).matchAll(PIPE)].map((m) => m[1]!));
}

/** A definition holding only the fields that `def` pipes into its texts (for formatting values on the client). */
export function pipeDefinition(def: FormDefinition, full: FormDefinition): FormDefinition {
  const ids = pipedIds(def);
  return { ...full, pages: [{ id: "pipe", title: "", fields: allFields(full).filter((f) => ids.has(f.id)).map((f) => ({ ...f, label: f.label })) }] };
}

export function answersForClient(def: FormDefinition, answers: Answers): Answers {
  const keep = new Set<string>(pipedIds(def));
  for (const page of def.pages) {
    conditionFieldRefs(page.visibleIf).forEach((r) => keep.add(r));
    for (const f of page.fields) {
      keep.add(f.id);
      conditionFieldRefs(f.visibleIf).forEach((r) => keep.add(r));
      conditionFieldRefs(f.disabledIf).forEach((r) => keep.add(r));
      if (f.formula) {
        const p = parseFormula(f.formula);
        if (p.ok) formulaRefs(p.ast).forEach((r) => keep.add(r));
      }
    }
  }
  return Object.fromEntries(Object.entries(answers).filter(([k]) => keep.has(k)));
}
