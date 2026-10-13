/** Which stored answers may be sent to a signer's browser: fields of their own view plus anything their conditions/formulas read. */
import { conditionFieldRefs, type Answers } from "./conditions";
import { formulaRefs, parseFormula } from "./formula";
import type { FormDefinition } from "./schema";

export function answersForClient(def: FormDefinition, answers: Answers): Answers {
  const keep = new Set<string>();
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
