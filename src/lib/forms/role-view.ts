/** What one signer sees: only their own fields as a form, everyone else's answers as a read-only summary. */
import type { Answers } from "./conditions";
import { FIELD_TYPE_META } from "./field-types";
import { formatAnswer } from "./format";
import type { FillerRole, FormDefinition } from "./schema";

export interface FilledItem {
  id: string;
  label: string;
  text: string;
}

export function roleView(def: FormDefinition, answers: Answers, role: FillerRole): { definition: FormDefinition; filled: FilledItem[] } {
  const filled: FilledItem[] = [];
  const pages = def.pages
    .map((page) => ({
      ...page,
      fields: page.fields.filter((f) => {
        if (!FIELD_TYPE_META[f.type].hasAnswer) return true; // layout blocks stay
        if ((f.filledBy ?? "employee") === role) return true;
        const text = formatAnswer(f, answers[f.id]);
        if (text) filled.push({ id: f.id, label: f.label, text });
        return false;
      }),
    }))
    // A page with nothing to answer for this role is not shown.
    .filter((p) => p.fields.some((f) => FIELD_TYPE_META[f.type].hasAnswer));
  return { definition: { ...def, pages }, filled };
}
