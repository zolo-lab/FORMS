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
  const kept = def.pages
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
  // A jump into a page that was dropped lands on the next page that is still shown (or ends the form).
  const keptIds = new Set(kept.map((p) => p.id));
  const retarget = (goTo: string): string => {
    if (goTo === "end" || keptIds.has(goTo)) return goTo;
    const at = def.pages.findIndex((p) => p.id === goTo);
    if (at === -1) return goTo;
    return def.pages.slice(at + 1).find((p) => keptIds.has(p.id))?.id ?? "end";
  };
  const pages = kept.map((p) => (p.nextPage ? { ...p, nextPage: p.nextPage.map((r) => ({ ...r, goTo: retarget(r.goTo) })) } : p));
  return { definition: { ...def, pages }, filled };
}
