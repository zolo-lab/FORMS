/** Fill in computed (formula) fields. Pure; the browser uses it live and the server again on submit. */
import type { Answers } from "./conditions";
import { evaluateFormula } from "./formula";
import { allFields, type FormDefinition, type FormField } from "./schema";

const MAX_PASSES = 4;

function applyList(fields: FormField[], scope: Answers, target: Answers, today: string): boolean {
  let changed = false;
  for (const f of fields) {
    if (!f.formula) continue;
    const v = evaluateFormula(f.formula, { answers: { ...scope, ...target }, today });
    const prev = target[f.id];
    if (v === null) {
      if (prev !== undefined) { delete target[f.id]; changed = true; }
    } else if (prev !== v) {
      target[f.id] = v;
      changed = true;
    }
  }
  return changed;
}

/** Returns a copy of `answers` with every formula field (also inside table rows) computed. */
export function computeFormulas(form: FormDefinition, answers: Answers, today: string): Answers {
  const fields = allFields(form);
  if (!fields.some((f) => f.formula || f.fields?.some((c) => c.formula))) return answers;
  const out: Answers = { ...answers };
  // A few passes so a formula may use another formula declared later in the form.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = applyList(fields, out, out, today);
    for (const t of fields) {
      if (t.type !== "repeating_table" || !t.fields?.some((c) => c.formula) || !Array.isArray(out[t.id])) continue;
      out[t.id] = (out[t.id] as Answers[]).map((row) => {
        const copy: Answers = { ...(row ?? {}) };
        if (applyList(t.fields!, out, copy, today)) changed = true;
        return copy;
      });
    }
    if (!changed) break;
  }
  return out;
}
